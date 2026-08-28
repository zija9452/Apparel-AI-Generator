# The planning half, for Cloud Run.
#
# What is NOT here, on purpose: pywin32, Illustrator, the .ai files, and the
# 938MB a job leaves behind. All of that lives on the designer's PC - see
# DEPLOYMENT_PLAN.md. This container reads a few hundred KB of Excel, calls
# Gemini, and returns JSON.

FROM python:3.13-slim

# Bytecode written at build time rather than on every cold start, and unbuffered
# output so logs reach Cloud Logging as they happen instead of at exit.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependencies first, as their own layer: application edits then rebuild in
# seconds instead of re-resolving pandas every time.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .
COPY services/ ./services/
# The JSX bundle is served from here to the agents - /automation/manifest and
# /automation/file. Leaving it out would mean every designer silently keeps
# running whatever render logic they installed with.
COPY scripts/ ./scripts/

# Not root. Cloud Run isolates containers, but a process that cannot write to
# its own code is one fewer thing to reason about.
RUN useradd --create-home --uid 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Cloud Run injects PORT and expects the server on 0.0.0.0. Uvicorn is invoked
# directly rather than through `python main.py` so the dev-only auto-reload
# path cannot be reached here at all.
ENV PORT=8080
EXPOSE 8080
CMD exec uvicorn main:app --host 0.0.0.0 --port ${PORT}
