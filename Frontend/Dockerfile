# ---------- build stage ----------
FROM node:20-alpine AS build
WORKDIR /app

# Install deps (must include higlass-multivec in package-lock.json)
COPY package.json package-lock.json ./
RUN npm ci

# Build
COPY . .
RUN npm run build

# ---------- runtime stage ---------- FROM discards older FROMs
FROM nginx:alpine AS prod
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Static site output
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
#command irrelevant, only needed for startFrontend.py
CMD ["nginx", "-g", "daemon off;"] 

