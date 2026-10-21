FROM pytorch/pytorch:2.1.2-cuda11.8-cudnn8-runtime

WORKDIR /app

RUN conda create --yes --name catvton python=3.9 && conda clean --all --yes
ENV PATH=/opt/conda/envs/catvton/bin:$PATH
ENV PYTHONPATH=/app
ENV PYTHONDONTWRITEBYTECODE=1

COPY ai_runtime/requirements-worker.txt /tmp/requirements-worker.txt
RUN pip install --no-cache-dir -r /tmp/requirements-worker.txt

COPY ai_runtime /app/ai_runtime

CMD ["python", "-m", "uvicorn", "ai_runtime.app:app", "--host", "0.0.0.0", "--port", "8001"]
