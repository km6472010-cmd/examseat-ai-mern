/**
 * Embedded JSON-file datastore -- SANDBOX-ONLY FALLBACK.
 *
 * Why this file exists: this app is written as a normal MERN app (real
 * Mongoose schemas in src/models/*.js, connected via `mongoose.connect()`
 * in src/db/connect.js). On a normal machine -- the user's own Windows PC,
 * a server, MongoDB Atlas -- that is exactly what runs: point MONGODB_URI
 * at a real MongoDB instance and this file is never touched.
 *
 * This specific cloud sandbox, however, only allows outbound HTTPS to a
 * small allow-list of package registries (npm, PyPI, crates.io, the Go
 * module proxy) -- no MongoDB Atlas, no `mongodb.org` binary downloads,
 * no Docker daemon, no apt `mongodb-server` package. Real MongoDB (local
 * or remote) is therefore unreachable from *this* container, full stop --
 * confirmed by testing every avenue (apt, Docker, mongodb-memory-server,
 * Maven/FerretDB, a Java-based mock server) before writing this fallback.
 *
 * So that `npm run dev` still produces a genuinely running, testable app
 * in an environment like this one, src/db/modelFactory.js transparently
 * swaps in this tiny local engine -- implementing the same handful of
 * Mongoose-style methods the app actually calls (find/findOne/findById/
 * create/findByIdAndUpdate/findByIdAndDelete/updateMany/deleteMany/
 * countDocuments) -- backed by one JSON file per collection under
 * data/localdb/. It is intentionally NOT a MongoDB reimplementation: no
 * aggregation pipeline, no real query operators beyond simple equality/
 * $in/$ne, no indexes. It exists purely so this specific sandbox can run
 * and be smoke-tested end-to-end.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_DIR = path.join(__dirname, '..', '..', 'data', 'localdb');
fs.mkdirSync(DB_DIR, { recursive: true });

function newId() {
  return crypto.randomBytes(12).toString('hex'); // looks like a Mongo ObjectId (24 hex chars)
}

function matches(doc, filter) {
  if (!filter) return true;
  for (const [key, cond] of Object.entries(filter)) {
    const val = doc[key];
    if (cond !== null && typeof cond === 'object' && !Array.isArray(cond)) {
      if ('$in' in cond && !cond.$in.includes(val)) return false;
      if ('$ne' in cond && val === cond.$ne) return false;
      if ('$exists' in cond && cond.$exists !== (val !== undefined && val !== null)) return false;
    } else if (val !== cond) {
      return false;
    }
  }
  return true;
}

function applySort(list, sort) {
  if (!sort) return list;
  const entries = Object.entries(sort);
  return [...list].sort((a, b) => {
    for (const [field, dir] of entries) {
      const av = a[field];
      const bv = b[field];
      if (av === bv) continue;
      const cmp = av > bv ? 1 : -1;
      return dir < 0 ? -cmp : cmp;
    }
    return 0;
  });
}

class LocalCollection {
  constructor(name, defaults = {}) {
    this.name = name;
    this.defaults = defaults;
    this.file = path.join(DB_DIR, `${name}.json`);
    this._load();
  }

  _load() {
    if (fs.existsSync(this.file)) {
      try {
        this.docs = JSON.parse(fs.readFileSync(this.file, 'utf-8'));
        return;
      } catch {
        // fall through to a fresh collection if the file is corrupt
      }
    }
    this.docs = [];
  }

  _persist() {
    fs.writeFileSync(this.file, JSON.stringify(this.docs, null, 2));
  }

  async create(data) {
    const doc = { ...this.defaults, ...data };
    if (!doc._id) doc._id = newId();
    if (!('createdAt' in doc)) doc.createdAt = new Date().toISOString();
    doc.updatedAt = new Date().toISOString();
    this.docs.push(doc);
    this._persist();
    return { ...doc };
  }

  async find(filter = {}, sort = null) {
    const found = this.docs.filter((d) => matches(d, filter));
    return applySort(found, sort).map((d) => ({ ...d }));
  }

  async findOne(filter = {}, sort = null) {
    const found = await this.find(filter, sort);
    return found[0] || null;
  }

  async findById(id) {
    if (id === null || id === undefined) return null;
    const doc = this.docs.find((d) => String(d._id) === String(id));
    return doc ? { ...doc } : null;
  }

  async findByIdAndUpdate(id, update) {
    const idx = this.docs.findIndex((d) => String(d._id) === String(id));
    if (idx === -1) return null;
    this.docs[idx] = { ...this.docs[idx], ...update, updatedAt: new Date().toISOString() };
    this._persist();
    return { ...this.docs[idx] };
  }

  async findByIdAndDelete(id) {
    const idx = this.docs.findIndex((d) => String(d._id) === String(id));
    if (idx === -1) return null;
    const [removed] = this.docs.splice(idx, 1);
    this._persist();
    return removed;
  }

  async updateMany(filter, update) {
    let count = 0;
    this.docs = this.docs.map((d) => {
      if (matches(d, filter)) {
        count += 1;
        return { ...d, ...update, updatedAt: new Date().toISOString() };
      }
      return d;
    });
    this._persist();
    return count;
  }

  async deleteMany(filter) {
    const before = this.docs.length;
    this.docs = this.docs.filter((d) => !matches(d, filter));
    this._persist();
    return before - this.docs.length;
  }

  async countDocuments(filter = {}) {
    return this.docs.filter((d) => matches(d, filter)).length;
  }
}

const registry = new Map();

function getLocalCollection(name, defaults) {
  if (!registry.has(name)) {
    registry.set(name, new LocalCollection(name, defaults));
  }
  return registry.get(name);
}

module.exports = { getLocalCollection, LocalCollection };
