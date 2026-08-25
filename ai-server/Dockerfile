# syntax=docker/dockerfile:1.7
#
# 배포용 AI 서버 이미지. 소스와 모델 아티팩트를 이미지에 굽는다.
# 학습 의존성(pytest 등)은 넣지 않는다 — 컨테이너는 추론만 한다.
ARG PYTHON_IMAGE=python:3.12-slim-bookworm
FROM ${PYTHON_IMAGE}

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends curl tini; \
    rm -rf /var/lib/apt/lists/*; \
    useradd -m -u 1000 -s /bin/bash app

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY terrabyte_ai/ ./terrabyte_ai/
COPY app/ ./app/
COPY models/ ./models/

USER 1000:1000

EXPOSE 8000

# 배포에서는 --reload 없이 워커를 띄운다. 워커 하나로 충분하다:
# 예측 1회가 수 ms 이고 백엔드 타임아웃은 800 ms 다.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
