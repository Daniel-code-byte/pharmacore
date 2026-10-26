FROM php:8.3-cli-alpine

RUN docker-php-ext-install pdo_sqlite pcntl \
    && apk add --no-cache composer sqlite

WORKDIR /app

COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoload --prefer-dist --no-interaction --no-progress

COPY . .

RUN composer dump-autoload --optimize

# Runtime config via env vars. APP_KEY is set as a Render env variable.
ENV APP_ENV=production \
    APP_DEBUG=false \
    DB_CONNECTION=sqlite \
    DB_DATABASE=/var/data/database.sqlite \
    SESSION_DRIVER=file \
    CACHE_STORE=file \
    LOG_LEVEL=info \
    PORT=10000

# /var/data is a Render persistent disk mount so SQLite survives deploys.
RUN mkdir -p /var/data database

EXPOSE 10000

CMD ["sh", "-c", "\
    if [ ! -f /var/data/database.sqlite ]; then touch /var/data/database.sqlite; fi; \
    php artisan migrate --force; \
    exec php -S 0.0.0.0:${PORT:-10000} -t public \
"]
