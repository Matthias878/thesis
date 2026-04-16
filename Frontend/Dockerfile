# ---------- build stage ----------
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- runtime stage ----------
FROM nginx:alpine AS prod
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"] 



# ---------- playwright test stage ----------
FROM mcr.microsoft.com/playwright:v1.59.1-jammy AS test

WORKDIR /tests

COPY tests/package.json tests/package-lock.json ./
RUN npm ci

COPY tests/ ./

CMD ["npx", "playwright", "test", "bulk-upload.spec.js", "--config=playwright.config.js"]