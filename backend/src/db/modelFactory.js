/**
 * Unified model factory.
 *
 * Defines a real Mongoose schema/model (the production code path) AND
 * wires up the local-store fallback (src/db/localStore.js, sandbox-only --
 * see that file for why), then returns one small async API that every
 * route/service in this app uses without caring which backend is live:
 *
 *   create(data) / find(filter, sort) / findOne(filter, sort) /
 *   findById(id) / findByIdAndUpdate(id, update) /
 *   findByIdAndDelete(id) / updateMany(filter, update) /
 *   deleteMany(filter) / countDocuments(filter)
 *
 * Every returned document is a plain JS object with a string `_id` --
 * callers never touch a Mongoose document instance or a Mongo ObjectId
 * directly, so the same route code works unmodified against either
 * backend.
 */
'use strict';

const mongoose = require('mongoose');
const { getMode } = require('./connect');
const { getLocalCollection } = require('./localStore');

function toPlain(doc) {
  if (!doc) return null;
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  obj._id = String(obj._id);
  delete obj.__v;
  return obj;
}

function defineModel(name, schemaDefinition, schemaOptions = { timestamps: true }) {
  const schema = new mongoose.Schema(schemaDefinition, schemaOptions);
  const MongooseModel = mongoose.model(name, schema);

  // Defaults applied by the local-store fallback, mirroring the Mongoose
  // schema's own `default:` values so both backends behave the same way.
  const localDefaults = {};
  for (const [field, def] of Object.entries(schemaDefinition)) {
    if (def && typeof def === 'object' && 'default' in def && typeof def.default !== 'function') {
      localDefaults[field] = def.default;
    }
  }

  const local = () => getLocalCollection(name, localDefaults);

  return {
    modelName: name,

    async create(data) {
      if (getMode() === 'mongo') {
        const created = await MongooseModel.create(data);
        return toPlain(created);
      }
      return local().create(data);
    },

    async find(filter = {}, sort = null) {
      if (getMode() === 'mongo') {
        let q = MongooseModel.find(filter);
        if (sort) q = q.sort(sort);
        const docs = await q.lean();
        return docs.map(toPlain);
      }
      return local().find(filter, sort);
    },

    async findOne(filter = {}, sort = null) {
      if (getMode() === 'mongo') {
        let q = MongooseModel.findOne(filter);
        if (sort) q = q.sort(sort);
        const doc = await q.lean();
        return toPlain(doc);
      }
      return local().findOne(filter, sort);
    },

    async findById(id) {
      if (!id) return null;
      if (getMode() === 'mongo') {
        if (!mongoose.Types.ObjectId.isValid(id)) return null;
        const doc = await MongooseModel.findById(id).lean();
        return toPlain(doc);
      }
      return local().findById(id);
    },

    async findByIdAndUpdate(id, update) {
      if (getMode() === 'mongo') {
        if (!mongoose.Types.ObjectId.isValid(id)) return null;
        const doc = await MongooseModel.findByIdAndUpdate(id, update, { new: true }).lean();
        return toPlain(doc);
      }
      return local().findByIdAndUpdate(id, update);
    },

    async findByIdAndDelete(id) {
      if (getMode() === 'mongo') {
        if (!mongoose.Types.ObjectId.isValid(id)) return null;
        const doc = await MongooseModel.findByIdAndDelete(id).lean();
        return toPlain(doc);
      }
      return local().findByIdAndDelete(id);
    },

    async updateMany(filter, update) {
      if (getMode() === 'mongo') {
        const res = await MongooseModel.updateMany(filter, update);
        return res.modifiedCount;
      }
      return local().updateMany(filter, update);
    },

    async deleteMany(filter) {
      if (getMode() === 'mongo') {
        const res = await MongooseModel.deleteMany(filter);
        return res.deletedCount;
      }
      return local().deleteMany(filter);
    },

    async countDocuments(filter = {}) {
      if (getMode() === 'mongo') {
        return MongooseModel.countDocuments(filter);
      }
      return local().countDocuments(filter);
    },
  };
}

module.exports = { defineModel };
