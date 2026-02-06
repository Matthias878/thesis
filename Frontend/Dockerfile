# ---------- build stage ----------
FROM node:20-alpine AS build

WORKDIR /app

# install deps first (better caching)
COPY package*.json ./
RUN npm ci

# copy source and build
COPY . .
RUN npm run build


# ---------- runtime stage ----------
FROM nginx:alpine

# remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# copy your own config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# copy built frontend
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
