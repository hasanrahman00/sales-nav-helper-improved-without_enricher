FROM mcr.microsoft.com/playwright:v1.55.0-jammy

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .

# Ensure runtime folders exist and are writable for the default Playwright user.
RUN mkdir -p /app/data/videos /app/data/debug /app/all_jobs /app/user_data \
	&& chown -R pwuser:pwuser /app

# Optional: headful debugging on VPS via Xvfb + VNC
RUN apt-get update \
	&& apt-get install -y --no-install-recommends xvfb x11vnc fluxbox \
	&& rm -rf /var/lib/apt/lists/*

RUN chmod +x /app/docker-entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["/app/docker-entrypoint.sh"]
