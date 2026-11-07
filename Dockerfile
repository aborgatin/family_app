# One image serves the API and the web bundle (spec #5, "Single image").
# Builds everything from source: `docker build .` from the repo root needs no prior local build.

# --- web bundle -------------------------------------------------------------------------------
FROM node:22-bookworm-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# --- backend jar with the bundle in its static resources --------------------------------------
FROM eclipse-temurin:21-jdk-noble AS backend
WORKDIR /backend
COPY backend/gradlew backend/settings.gradle.kts backend/build.gradle.kts ./
COPY backend/gradle/ gradle/
# Resolve Gradle and dependencies in their own layer so source changes reuse it.
RUN ./gradlew --no-daemon dependencies > /dev/null
COPY backend/src/ src/
# The Child color palette lives in the web app and is read by build.gradle.kts from ../web.
COPY web/src/shared/palette/ /web/src/shared/palette/
COPY --from=web /web/dist/ src/main/resources/static/
RUN ./gradlew --no-daemon bootJar && cp build/libs/*.jar /app.jar

# --- runtime ----------------------------------------------------------------------------------
FROM eclipse-temurin:21-jre-noble
RUN groupadd --system app && useradd --system --gid app --no-create-home app
WORKDIR /app
COPY --from=backend /app.jar app.jar
USER app
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
