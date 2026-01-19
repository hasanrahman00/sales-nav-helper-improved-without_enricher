FROM mcr.microsoft.com/playwright:v1.55.0-jammy

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .

# Ensure runtime folders exist and are writable for the default Playwright user.
RUN mkdir -p /app/data/videos /app/data/debug /app/all_jobs /app/user_data \
	&& chown -R pwuser:pwuser /app

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["npm", "start"]
