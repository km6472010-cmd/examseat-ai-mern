FROM python:3.11-slim

# libgl1/libglib2.0-0: required by opencv-python-headless at import time.
# tesseract-ocr: backs the seating-plan OCR extraction feature (app/cv/ocr.py).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# app/config.py defaults DATA_DIR/REPORTS_DIR/MODELS_DIR to paths relative to
# the project root one level above backend/, which doesn't exist inside this
# image -- docker-compose.yml sets DATA_DIR/REPORTS_DIR/MODELS_DIR explicitly
# to /app/data, /app/reports, /app/models (bind-mounted as volumes) instead.
RUN mkdir -p /app/data/uploads /app/data/processed /app/data/demo /app/reports /app/models

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
