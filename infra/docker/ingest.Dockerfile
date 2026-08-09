# Streaming ingest service. Same build shape as the API; different module.

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

COPY services/pom.xml services/pom.xml
COPY services/gsih-common/pom.xml services/gsih-common/pom.xml
COPY services/gsih-investigations-api/pom.xml services/gsih-investigations-api/pom.xml
COPY services/gsih-ingest-service/pom.xml services/gsih-ingest-service/pom.xml
RUN mvn -f services/pom.xml -B -q dependency:go-offline -DskipTests || true

COPY services services
RUN mvn -f services/pom.xml -B -q -pl gsih-common,gsih-ingest-service -am package -DskipTests

FROM eclipse-temurin:21-jre-jammy
WORKDIR /app
RUN groupadd --system gsih && useradd --system --gid gsih --home /app gsih
COPY --from=build /build/services/gsih-ingest-service/target/*.jar app.jar
USER gsih

EXPOSE 8081
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75 -XX:+UseG1GC"
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
