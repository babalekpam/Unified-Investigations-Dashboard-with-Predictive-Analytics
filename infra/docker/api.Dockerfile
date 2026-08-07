# Investigations API — Spring Boot on a distroless-style JRE base.
# Build context is the repository root: `docker build -f infra/docker/api.Dockerfile .`

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# Dependency resolution is cached separately from source so a code change does not
# re-download the world on every build.
COPY services/pom.xml services/pom.xml
COPY services/gsih-common/pom.xml services/gsih-common/pom.xml
COPY services/gsih-investigations-api/pom.xml services/gsih-investigations-api/pom.xml
COPY services/gsih-ingest-service/pom.xml services/gsih-ingest-service/pom.xml
RUN mvn -f services/pom.xml -B -q dependency:go-offline -DskipTests || true

COPY services services
RUN mvn -f services/pom.xml -B -q -pl gsih-common,gsih-investigations-api -am package -DskipTests

FROM eclipse-temurin:21-jre-jammy
WORKDIR /app

# Never run as root: the container has no reason to own anything it writes.
RUN groupadd --system gsih && useradd --system --gid gsih --home /app gsih
COPY --from=build /build/services/gsih-investigations-api/target/*.jar app.jar
USER gsih

EXPOSE 8080
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75 -XX:+UseG1GC"

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD ["sh", "-c", "wget -qO- http://localhost:8080/actuator/health/readiness || exit 1"]

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
