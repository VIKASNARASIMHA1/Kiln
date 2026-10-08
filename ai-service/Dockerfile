FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Run as an unprivileged user: learner code executes inside this container.
RUN useradd --create-home --uid 10001 app && chown -R app /app
USER app
EXPOSE 8000
# Render sets PORT; everywhere else the service listens on 8000.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
