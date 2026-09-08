# Delta Kubernetes Proof of Concept

## 1. Purpose

This proof of concept evaluates the migration of the Delta application
from its existing Docker-based local deployment model to Kubernetes,
with the longer-term objective of assessing deployment to Azure
Kubernetes Service (AKS).

The PoC follows an incremental approach. Rather than attempting to
migrate the complete Delta stack at once, each component is migrated and
validated independently before adding the next dependency.

The initial sequence is:

1.  PostgreSQL/PostGIS database
2.  Adminer database administration interface
3.  Delta application
4.  Complete application validation
5.  Container image build and developer workflow review
6.  Preparation for deployment to AKS

This approach makes it easier to identify whether issues originate from
the application, container configuration, Kubernetes networking, image
distribution, or dependencies between components.

## 2. What is Kubernetes?

Kubernetes is an open-source container orchestration platform used to
deploy, manage and scale containerized applications.

Docker packages and runs individual application containers. Kubernetes
adds an orchestration layer that manages how those containers are
deployed, networked, restarted, scaled and updated.

A key Kubernetes principle is **desired state**: the required
application state is declared in configuration, and Kubernetes
continuously attempts to keep the running environment aligned with that
declaration.

For example, a Kubernetes Deployment can specify that one instance of
the Delta application should be running. If the corresponding Pod fails,
Kubernetes detects that the actual state no longer matches the desired
state and attempts to create a replacement.

## 3. Why Kubernetes for Delta?

The PoC evaluates whether Kubernetes can provide Delta with:

- repeatable and declarative deployments;
- improved application resilience;
- scaling capabilities;
- separation of application configuration from container images;
- stable networking between application components;
- portability between local environments and managed Kubernetes
  platforms;
- a deployment model compatible with Azure Kubernetes Service (AKS).

The PoC does not assume that Kubernetes is necessarily the preferred
production hosting solution. Operational complexity, architecture and
cost are considered separately in the Delta hosting-options assessment.

The purpose of this document is therefore primarily to document the
Kubernetes implementation and the practical migration process.

## 4. Key concepts

### Pod

The smallest deployable workload in Kubernetes. A Pod normally contains
one application container.

Pods are considered disposable. Kubernetes may replace a Pod as part of
failure recovery, configuration changes or application updates.

### Deployment

Defines and maintains the desired configuration and number of
application Pods.

For example, the database Deployment defines the PostGIS container that
Kubernetes should keep running.

### Service

Provides a stable network endpoint through which Pods can be reached.

Pods may be replaced and their IP addresses may change. Services
therefore provide stable names and addresses that other application
components can use.

For example, Adminer and Delta connect to the database using the
Kubernetes Service name `delta-local-db` rather than the IP address of
the current database Pod.

### ConfigMap

Stores non-sensitive application configuration independently from the
container image.

### Secret

Stores sensitive configuration such as credentials or keys independently
from the application Deployment.

For the local PoC, the Delta database connection string and development
session secret are stored in a Kubernetes Secret named:

`delta-local-app-secret`

The PoC uses development-only values. Kubernetes Secrets separate
sensitive values from the application Deployment, but they should not be
treated as a complete production secrets-management solution. Production
credentials should not be committed to the source repository.

For AKS, an appropriate Azure secrets-management approach should be
defined separately.

### Port forwarding

`kubectl port-forward` provides temporary access from the local
workstation to a Kubernetes resource.

For example:

```bash
kubectl port-forward service/delta-local-db 15432:5432
```

makes the Kubernetes database temporarily accessible from the
workstation on `localhost:15432`, while PostgreSQL continues to use its
normal port `5432` inside Kubernetes.

The forwarding exists only while the `kubectl port-forward` command is
running.

## 5. Existing Delta architecture and baseline

Before starting the migration, the latest `dev` branch was restored and
the existing Delta Docker environment was validated.

The existing local Docker Compose environment contains three services:

---

Service Image Host Container Purpose
port port

---

`db` `postgis/postgis:17-3.5` 5432 5432 PostgreSQL/PostGIS
database

`app` `delta/local-app` 3000 3000 Delta application

`adminer` `adminer` 8080 8080 Database administration
interface

---

The existing Docker-based environment remains operational during the
Kubernetes PoC. The Kubernetes configuration must not interfere with the
existing Docker Desktop environment or other Docker-based development
environments.

### Immutable Delta image reference

The initial Kubernetes Deployment referenced the Delta development image
using the floating tag:

```text
ghcr.io/preventionweb/delta-country:dev-latest
```

A floating tag can reference a different image over time, meaning that
reapplying an unchanged Kubernetes manifest would not necessarily
reproduce the same application version.

The running development image was therefore resolved to its immutable
SHA-256 digest:

```text
ghcr.io/preventionweb/delta-country@sha256:e75a3572f394b79ede4ebf2877c4d76213b7c498029c7edb8901fe1099aee0c5
```

The Delta Deployment was updated to use this immutable reference and was
successfully redeployed and validated.

This ensures that the PoC manifests reproduce the same Delta application
image even if the `dev-latest` tag subsequently changes.

### Delta container models

Review of the repository identified three container/deployment models
serving different purposes.

#### Local development

The standard `docker-compose.yml` uses `Dockerfile.app` to create the
local development runtime image:

```text
delta/local-app
```

This image does not contain the Delta application source code itself.
Docker Compose bind-mounts the local source directory into `/delta`
inside the running container.

Conceptually:

```text
Local source code
      ↓
bind mount
      ↓
/delta inside container
      ↓
Node development runtime
```

This provides a convenient development workflow because developers can
modify source files locally without rebuilding and publishing a new
container image after each change.

The image is therefore primarily a **local development runtime image**
rather than a self-contained deployable Delta application image.

#### Deployable development image

The repository also contains `Dockerfile.dev`, which builds a
self-contained development image.

Unlike `Dockerfile.app`, it installs the application dependencies and
copies the Delta source code into the image. The existing shared
development environment uses:

```text
ghcr.io/preventionweb/delta-country:dev-latest
```

This image can therefore be executed without mounting the source tree
from the developer workstation and is more appropriate for Kubernetes.

#### Production image

A separate `Dockerfile.prod` provides the production build. It uses a
multi-stage build process in which the application is built in a builder
stage and the required runtime artifacts are copied into the final
production image.

The existing production environment uses:

```text
ghcr.io/preventionweb/delta-country:prod-latest
```

The overall distinction is:

```text
Local development
Dockerfile.app + docker-compose.yml
        ↓
source mounted from developer workstation
        ↓
fast edit/test workflow

Shared development environment
Dockerfile.dev
        ↓
self-contained development image
        ↓
container registry
        ↓
deployed development environment

Production environment
Dockerfile.prod
        ↓
optimized self-contained production image
        ↓
container registry
        ↓
production environment
```

For the Kubernetes PoC, the existing self-contained development image is
used initially rather than reproducing the local Docker Compose
bind-mount model.

### Performance baseline

The first Delta page was observed taking approximately **2.2 minutes**
to load in the existing local Docker environment, with a later measured
request reaching approximately **287 seconds** before returning HTTP 200.

This is recorded as a baseline so that existing application performance
is not incorrectly attributed to Kubernetes during subsequent testing.

## 6. Local Kubernetes environment

Kubernetes was enabled using Docker Desktop.

The cluster was validated using:

```bash
kubectl cluster-info
kubectl get nodes
kubectl get pods -A
```

A simple nginx Deployment was initially used to validate basic
Kubernetes functionality and understand the relationship between:

- Deployment
- Pod
- Service
- port forwarding

The Kubernetes PoC work is maintained in a dedicated Git branch. After
the Delta repository moved to the new GitHub organization, the PoC
commit was reapplied on a branch based on the new repository's `dev`
branch.

Kubernetes manifests are stored separately under:

```text
k8s/
```

The manifests are separated by component so that each Kubernetes
resource remains easy to understand and maintain.

Application configuration is also separated from the Deployment itself.
Non-sensitive Delta configuration is stored in a ConfigMap, while
sensitive application configuration is stored in a Secret.

The local PoC therefore includes dedicated resources for:

- Delta application Deployment and Service;
- PostgreSQL/PostGIS Deployment, Service and persistent storage;
- Adminer Deployment and Service;
- `/delta/uploads` persistent storage;
- Delta application ConfigMap;
- Delta application Secret.

This separation keeps the Deployment focused primarily on how the
application runs rather than embedding all environment-specific
configuration directly in the workload definition.

## 7. Migration steps

### Step 1 - Migrate the PostgreSQL/PostGIS database

The database was selected as the first Delta component to migrate
because the Delta application depends on it.

A Kubernetes Deployment was created using the same PostGIS image as the
existing Docker Compose environment:

```yaml
image: postgis/postgis:17-3.5
```

The initial database Pod failed immediately after startup.

Inspection was performed using:

```bash
kubectl describe pod <pod-name>
kubectl logs <pod-name>
```

The Kubernetes configuration initially contained no environment
variables, while the PostGIS container requires PostgreSQL
initialization parameters.

The following configuration was therefore added:

```yaml
env:
  - name: POSTGRES_USER
    value: "postgres"
  - name: POSTGRES_PASSWORD
    value: "postgres"
  - name: POSTGRES_DB
    value: "dts-shared-01"
```

The PostgreSQL container listens on its standard port:

```yaml
ports:
  - containerPort: 5432
```

The database Pod subsequently started successfully.

### Step 2 - Create the database Service

A Kubernetes Service was created to provide a stable network endpoint
for the database:

```yaml
apiVersion: v1
kind: Service

metadata:
  name: delta-local-db

spec:
  selector:
    app: delta-local-db

  ports:
    - port: 5432
      targetPort: 5432
```

This creates an internal Kubernetes endpoint named:

```text
delta-local-db:5432
```

The existing Docker PostgreSQL instance already uses `localhost:5432`.
This does not conflict with the Kubernetes Service because the Service
port exists inside the Kubernetes network rather than on the
workstation.

For testing from the workstation, a different local port was used:

```bash
kubectl port-forward service/delta-local-db 15432:5432
```

The connection path is therefore:

```text
localhost:15432
    ↓
delta-local-db Service :5432
    ↓
PostGIS Pod :5432
```

Database connectivity was successfully validated using:

```bash
psql -h localhost -p 15432 -U postgres -d dts-shared-01
```

This confirmed that the PostGIS database was running successfully inside
Kubernetes and accessible through the Kubernetes Service.

### Step 3 - Migrate Adminer

Adminer was selected as the second component because it depends on the
database and provides a convenient way to validate communication between
Kubernetes workloads.

A separate Deployment was created using:

```yaml
image: adminer
```

Adminer was configured to use the Kubernetes database Service:

```yaml
env:
  - name: ADMINER_DEFAULT_SERVER
    value: "delta-local-db"
```

This demonstrates an important Kubernetes networking principle:
application components communicate using stable Kubernetes Service names
rather than Pod IP addresses.

The communication path is:

```text
Adminer Pod
    ↓
delta-local-db
    ↓
Database Service :5432
    ↓
PostGIS Pod :5432
```

A separate Service was created for Adminer on port 8080.

Because the existing Docker Adminer already uses `localhost:8080`, the
Kubernetes Adminer was temporarily exposed on a different workstation
port:

```bash
kubectl port-forward service/delta-adminer 18080:8080
```

Adminer was then accessed through:

```text
http://localhost:18080
```

A successful login to the PostgreSQL/PostGIS database through Adminer
confirmed that:

- the Adminer Pod was running;
- the Adminer Service was working;
- Kubernetes DNS resolved `delta-local-db`;
- Adminer could communicate with the database Service;
- the database Service correctly routed traffic to the PostGIS Pod.

### Step 4 - Review the Delta image build model

Before deploying the Delta application, the existing image build process
was reviewed.

An initial inspection of the locally built image showed that `/delta`
was empty when the image was run without Docker Compose:

```bash
docker run --rm delta/local-app ls -la /delta
```

This confirmed that the local `delta/local-app` image depends on the
Docker Compose bind mount and is not self-contained.

Review of `Dockerfile.dev`, `Dockerfile.prod`, `docker-compose.dev.yml`
and `docker-compose.prod.yml` showed that Delta already has separate
self-contained images for deployed development and production
environments.

This avoided unnecessarily redesigning the existing container build
process as part of the Kubernetes PoC.

### Step 5 - Create the Delta application Service

A Kubernetes Service was created for the Delta application:

```yaml
apiVersion: v1
kind: Service

metadata:
  name: delta-local-app

spec:
  selector:
    app: delta-local-app

  ports:
    - port: 3000
      targetPort: 3000
```

The Service provides a stable internal endpoint for the Delta
application independently of the individual application Pod.

### Step 6 - Create the Delta application Deployment

The Delta application requires several environment variables for
database connectivity and application configuration.

During the initial migration these values were defined directly in the
Deployment so that application startup could be validated. Once the
basic deployment was operational, the configuration was separated into
Kubernetes configuration resources.

Non-sensitive application settings are stored in the
`delta-local-app-config` ConfigMap:

```yaml
data:
  EMAIL_TRANSPORT: "file"
  AUTHENTICATION_SUPPORTED: "form"
  PUBLIC_URL: "http://localhost:13000"
  EMAIL_FROM: '"Example (from Kubernetes PoC)" <no-reply@example.com>'
  TZ: "UTC"
```

Sensitive application settings are stored separately in the
`delta-local-app-secret` Secret:

```yaml
stringData:
  DATABASE_URL: "postgresql://postgres:postgres@delta-local-db:5432/dts-shared-01"
  SESSION_SECRET: "not-random-dev-secret"
```

The Delta Deployment imports both resources:

```yaml
envFrom:
  - configMapRef:
      name: delta-local-app-config
  - secretRef:
      name: delta-local-app-secret
```

The resulting configuration model is:

```text
delta-local-app-config
        │
        │ non-sensitive configuration
        ▼
Delta application Pod
        ▲
        │ sensitive configuration
        │
delta-local-app-secret
```

The important networking difference from Docker Compose remains the
database hostname.

Docker Compose uses:

```text
db
```

Kubernetes uses:

```text
delta-local-db
```

because `delta-local-db` is the Kubernetes Service providing access to
PostgreSQL.

The resulting path is:

```text
Delta application Pod
        ↓
delta-local-db:5432
        ↓
Database Service
        ↓
PostGIS Pod
```

### Step 7 - Diagnose application image availability

The first application Deployment used the locally built image:

```text
delta/local-app
```

Kubernetes attempted to retrieve this image from Docker Hub and
returned:

```text
ImagePullBackOff
```

The Deployment was temporarily changed to:

```yaml
imagePullPolicy: Never
```

which resulted in:

```text
ErrImageNeverPull
```

This demonstrated that the locally built Docker image was not available
in the Kubernetes node image store.

More importantly, the earlier image inspection had already shown that
`delta/local-app` was not the appropriate deployable image because it
depends on the local source-code bind mount.

The Deployment was therefore changed to the existing self-contained
development image:

```yaml
image: ghcr.io/preventionweb/delta-country:dev-latest
```

Kubernetes successfully retrieved this image from the container
registry.

### Step 8 - Validate the self-contained image

Before starting Delta itself, the application Deployment was temporarily
configured with a diagnostic command:

```yaml
command:
  - sh
  - -c
  - |
    echo "Delta Kubernetes diagnostic container started"
    echo "Contents of /delta:"
    ls -la /delta
    sleep 3600
```

The Pod successfully reached:

```text
1/1 Running
```

Inspection of `/delta` confirmed that the image contains the complete
Delta application, including the application source, `package.json`,
`yarn.lock` and installed dependencies.

The temporary diagnostic command was then removed so that the image
could execute its normal startup command.

### Step 9 - Start the Delta application in Kubernetes

After removing the diagnostic command, the Deployment was reapplied:

```bash
kubectl apply -f delta-app-deployment.yml
```

The application Pod successfully started.

The logs showed that the database migrations were applied:

```text
Using 'pg' driver for database querying
migrations applied successfully!
Done in 3.56s.
```

The Delta development server then started successfully:

```text
$ /delta/node_modules/.bin/react-router dev --host 0.0.0.0 --port 3000

[timer] vite config resolved: 0.52s
[timer] build start (dep scan begins): 0.70s
[timer] server LISTENING: 0.86s

Local:   http://localhost:3000/
Network: http://<pod-ip>:3000/
```

At this stage, Kubernetes reported all three Delta components as
running:

```text
delta-adminer-app    1/1 Running
delta-local-app      1/1 Running
delta-local-db       1/1 Running
```

This represents the first complete startup of the Delta application
stack inside the local Kubernetes cluster.

### Step 10 - Expose Delta locally for browser validation

The Delta Service can be temporarily exposed to the workstation using:

```bash
kubectl port-forward service/delta-local-app 13000:3000
```

The Kubernetes-hosted application can then be accessed at:

```text
http://localhost:13000
```

Browser-level validation confirmed that the Delta application is
accessible through the Kubernetes Service and that application routes
operate correctly. In particular, the authentication page was
successfully validated at:

```text
http://localhost:13000/en/admin/login
```

The equivalent Docker Compose route is:

```text
http://localhost:3000/en/admin/login
```

This keeps the existing Docker Compose and Kubernetes environments
separate:

```text
Docker Compose Delta     http://localhost:3000
Kubernetes Delta         http://localhost:13000
```

This provides a convenient mechanism for direct functional and
performance comparison between the existing local Docker development
environment and the Kubernetes PoC.

## 8. Issues and resolutions

| Issue                                                                                                | Cause                                                                               | Resolution                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostGIS Pod started and immediately terminated                                                       | Required PostgreSQL environment variables were missing                              | Added `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` to the database Deployment                                                              |
| Database was initially configured with port 15432 inside Kubernetes                                  | Host ports and Kubernetes internal ports were initially treated as equivalent       | Restored PostgreSQL to its standard internal port 5432 and used port forwarding to map workstation port 15432 to Kubernetes port 5432                |
| Initial Service still referenced `delta-web`                                                         | Service configuration originated from the initial nginx/web test                    | Removed the obsolete Service and created `delta-local-db` with the correct selector                                                                  |
| Adminer initially used Docker-style database hostname `db`                                           | Kubernetes workloads should use the Kubernetes Service name                         | Configured Adminer to use `delta-local-db`                                                                                                           |
| Existing Docker services already use ports 5432, 8080 and 3000                                       | Docker host ports must remain available during the PoC                              | Used ports 15432, 18080 and 13000 respectively for Kubernetes port-forward testing                                                                   |
| Kubernetes returned `ImagePullBackOff` for `delta/local-app`                                         | Kubernetes attempted to retrieve the locally named image from Docker Hub            | Investigated the Delta image build architecture                                                                                                      |
| Kubernetes returned `ErrImageNeverPull` after setting `imagePullPolicy: Never`                       | The image was not available in the Kubernetes node image store                      | Switched to the existing self-contained `ghcr.io/preventionweb/delta-country:dev-latest` image                                                       |
| `delta/local-app` did not contain the Delta source code                                              | It is designed for local Docker Compose development and relies on a host bind mount | Used the existing self-contained development image built using `Dockerfile.dev`                                                                      |
| Initial Delta Kubernetes Pod ran but did not start Delta                                             | A temporary diagnostic `command` overrode the image startup command                 | Removed the diagnostic command after validating the image contents                                                                                   |
| Delta application initially restarted after Kubernetes cluster startup with EAI_AGAIN delta-local-db | Application migrations started before the database Service was resolvable/ready     | Application recovered after the database became available; startup dependency handling should be improved using Kubernetes health/startup mechanisms |

### Docker and Kubernetes performance comparison

A direct performance comparison was performed against the same
application route in the existing Docker Compose environment and the
Kubernetes PoC:

```text
/en/admin/login
```

Three requests were measured against each environment.

| Environment    | Request 1 | Request 2 | Request 3 |
| -------------- | --------: | --------: | --------: |
| Docker Compose |   1.398 s |   0.188 s |   0.254 s |
| Kubernetes     |   1.133 s |   0.243 s |   0.342 s |

Both environments showed a slower first request followed by substantially
faster subsequent requests. The results are broadly comparable and do
not indicate a material performance overhead introduced by Kubernetes
in the local PoC.

These measurements also suggest that the much slower responses observed
earlier in the Delta environment were not inherently caused by
Kubernetes.

## 9. Validation

### Kubernetes cluster

The local Kubernetes cluster was validated using:

```bash
kubectl cluster-info
kubectl get nodes
kubectl get pods
kubectl get services
```

### Database

The PostGIS Pod reports `Running` and database connectivity was
successfully tested using:

```bash
psql -h localhost -p 15432 -U postgres -d dts-shared-01
```

### Adminer

Adminer was successfully accessed through:

```text
http://localhost:18080
```

and successfully connected to the PostgreSQL/PostGIS database using the
internal Kubernetes Service `delta-local-db`.

### Delta application

The Delta application Pod successfully starts using:

```text
ghcr.io/preventionweb/delta-country:dev-latest
```

Application startup successfully:

1.  connects to the Kubernetes-hosted PostgreSQL database;
2.  applies the required database migrations;
3.  starts the React Router/Vite development server;
4.  listens on port 3000 inside the Pod.

The complete Kubernetes stack reports:

```text
delta-adminer-app    1/1 Running
delta-local-app      1/1 Running
delta-local-db       1/1 Running
```

Browser-level application validation is performed by forwarding the
Delta Service:

```bash
kubectl port-forward service/delta-local-app 13000:3000
```

and accessing:

```text
http://localhost:13000
```

### Existing Docker environment

The existing Docker-based Delta environment remains operational
independently of the Kubernetes environment.

This allows direct comparison between the existing deployment and the
Kubernetes PoC during the migration.

### Complete environment recreation

Reproducibility of the Kubernetes configuration was validated by creating
a new empty Kubernetes namespace and applying only the manifests stored
under `k8s/`:

```bash
kubectl create namespace delta-poc-recreate
kubectl apply -n delta-poc-recreate -f k8s
```

From these manifests Kubernetes successfully created:

- the PostgreSQL/PostGIS Deployment, Service and persistent storage;
- the Adminer Deployment and Service;
- the Delta application Deployment and Service;
- the uploads persistent storage;
- the Delta ConfigMap;
- the Delta Secret.

All three application Pods started successfully in the new namespace.

The recreated Delta application was then exposed independently and the
`/en/admin/login` route returned HTTP 200.

This confirms that the complete local Kubernetes environment can be
recreated from the committed Kubernetes manifests without relying on
manually created Delta resources.

## 10. Persistence, startup dependencies and application health

Once the complete Delta stack was operational in Kubernetes, the PoC
moved from basic application migration toward deployment resilience.

A Kubernetes Pod is intentionally disposable. Application state must
therefore not depend on the lifetime of an individual Pod, and
Kubernetes must be able to determine whether application components are
actually ready to provide their services.

The PoC addresses these requirements through persistent storage,
database readiness checking, an application init container, and
application health probes.

### 10.1 PostgreSQL persistent storage

The initial PostgreSQL Deployment stored its database files inside the
container filesystem. Replacement of the database Pod could therefore
result in loss of the Kubernetes database.

A `PersistentVolumeClaim` was created:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim

metadata:
  name: delta-local-db-data

spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
```

The PostgreSQL Deployment mounts the claim at the PostgreSQL data
location:

```yaml
volumeMounts:
  - name: db-data
    mountPath: /var/lib/postgresql/data

volumes:
  - name: db-data
    persistentVolumeClaim:
      claimName: delta-local-db-data
```

Docker Desktop's default Kubernetes StorageClass dynamically provisions
the corresponding PersistentVolume.

```text
PostgreSQL Pod
      ↓
/var/lib/postgresql/data
      ↓
PersistentVolumeClaim
      ↓
PersistentVolume
      ↓
persistent storage
```

This separates the database lifecycle from the Pod lifecycle.

Persistence was explicitly validated by creating test data in
PostgreSQL, deleting the PostgreSQL Pod, allowing the Deployment to
create a replacement Pod, and querying the database from the replacement
Pod. The test data remained available after Pod replacement.

This local storage configuration does **not** imply that PostgreSQL
should necessarily run inside AKS. For the Azure architecture, a managed
PaaS database such as Azure Database for PostgreSQL should be evaluated
separately.

### 10.2 PostgreSQL readiness

A running container does not necessarily mean that PostgreSQL is ready
to accept connections. The database Deployment therefore uses a
readiness probe:

```yaml
readinessProbe:
  exec:
    command:
      - pg_isready
      - -U
      - postgres
      - -d
      - dts-shared-01
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3
```

After an initial five-second delay, Kubernetes executes `pg_isready`
every five seconds. An individual check may take at most three seconds,
and three consecutive failures are tolerated before the Pod is
considered not ready.

```text
PostgreSQL container running
          ↓
      pg_isready
          ↓
    ┌─────┴─────┐
    ↓           ↓
not ready      ready
    ↓           ↓
READY 0/1     READY 1/1
```

During testing, the readiness probe initially returned:

```text
/var/run/postgresql:5432 - no response
```

while PostgreSQL was starting. A subsequent probe succeeded and
Kubernetes changed the Pod to `Ready`.

This is the intended behavior: Kubernetes does not treat the database as
available merely because its container process has started.

### 10.3 Delta database startup dependency

The initial PoC showed that Delta could start before the database was
available, producing errors such as:

```text
EAI_AGAIN delta-local-db
```

Kubernetes does not provide Docker Compose-style `depends_on` ordering
between Deployments. Delta therefore uses an `initContainer` to enforce
the startup dependency:

```yaml
initContainers:
  - name: wait-for-database
    image: postgis/postgis:17-3.5
    command:
      - sh
      - -c
      - |
        until pg_isready \
          -h delta-local-db \
          -p 5432 \
          -U postgres \
          -d dts-shared-01
        do
          echo "Waiting for PostgreSQL..."
          sleep 2
        done
        echo "PostgreSQL is ready."
```

The startup sequence is:

```text
Delta Pod created
       ↓
wait-for-database init container
       ↓
pg_isready against delta-local-db
       ↓
database unavailable → wait and retry
       ↓
database available
       ↓
init container completes
       ↓
Delta application container starts
```

This was validated by deliberately deleting both the Delta and
PostgreSQL Pods. The replacement Delta Pod remained in `Init:0/1` while
PostgreSQL was starting. Once PostgreSQL became ready, Delta progressed
through `PodInitializing` to `1/1 Running`.

This confirms that Delta no longer relies on the database happening to
start first.

### 10.4 Delta startup, readiness and liveness probes

The next hardening step is to add application probes so Kubernetes can
distinguish between three conditions:

- Delta is still starting;
- Delta is running but should temporarily not receive traffic;
- Delta is no longer functioning and should be restarted.

The Delta Deployment uses the following probe configuration:

```yaml
startupProbe:
  tcpSocket:
    port: 3000
  periodSeconds: 5
  timeoutSeconds: 2
  failureThreshold: 60

readinessProbe:
  tcpSocket:
    port: 3000
  periodSeconds: 5
  timeoutSeconds: 2
  failureThreshold: 3

livenessProbe:
  tcpSocket:
    port: 3000
  periodSeconds: 10
  timeoutSeconds: 2
  failureThreshold: 3
```

#### Startup probe

The startup probe asks whether Delta has completed startup sufficiently
to listen on port 3000. It checks every five seconds and permits up to
60 consecutive failures:

```text
5 seconds × 60 failures = maximum 300-second startup allowance
```

The five-minute allowance is deliberately conservative because Delta has
demonstrated slow application behavior during the PoC. While the startup
probe has not succeeded, liveness checking is prevented from causing
premature application restarts. Once startup succeeds, the startup probe
has completed its role for that container lifecycle.

#### Readiness probe

The readiness probe asks whether the Delta Pod should currently receive
traffic through its Kubernetes Service. It checks every five seconds and
requires three consecutive failures before the Pod is considered not
ready.

A readiness failure does **not** restart the container:

```text
Delta running
      ↓
readiness probe fails repeatedly
      ↓
Pod marked Not Ready
      ↓
Kubernetes Service stops routing traffic to the Pod
```

This becomes particularly useful with multiple replicas because
unhealthy replicas can be removed from Service endpoints while healthy
replicas continue serving traffic.

#### Liveness probe

The liveness probe asks whether the Delta container is unhealthy enough
that Kubernetes should restart it. It checks every ten seconds and
requires three consecutive failures.

Liveness is deliberately less aggressive than readiness because
restarting a container is more disruptive than temporarily removing it
from service:

```text
readiness failure → stop sending traffic
liveness failure  → restart the container
```

#### Why TCP probes are used

The PoC uses TCP probes against port 3000 rather than HTTP requests
against a normal Delta application route. A TCP probe verifies that the
Delta process is accepting connections without executing a potentially
expensive application request.

This is appropriate for the PoC because Delta has demonstrated unusually
slow responses on some application pages. Using such a page as a
liveness endpoint could cause Kubernetes to interpret application
slowness as application failure and unnecessarily restart the container.

A dedicated lightweight endpoint such as `/health` or `/healthz` would
provide a stronger long-term health check because it could verify
application-level responsiveness rather than only TCP connectivity. If
such an endpoint is introduced, the AKS deployment should consider HTTP
probes instead.

### 10.5 Combined recovery model

Together, persistence, dependency checking and health probes provide the
following model:

```text
Kubernetes creates/recreates PostgreSQL
        ↓
persistent volume is reattached
        ↓
existing database remains available
        ↓
PostgreSQL starts
        ↓
readiness probe confirms PostgreSQL availability
        ↓
Delta init container confirms database connectivity
        ↓
Delta application container starts
        ↓
startup probe confirms port 3000 is listening
        ↓
readiness probe allows application traffic
        ↓
liveness probe continues monitoring the running container
```

Persistence, startup dependency handling and the Delta health probes
have been implemented and validated. Kubernetes reports the Delta Pod as
Ready with the startup, readiness and liveness probes active.

The recovery model was also tested through deliberate Pod deletion
rather than only by inspecting the Kubernetes configuration.

## 11. Current status and next steps

The basic Delta application stack is now operational in local
Kubernetes. The remaining work is divided into three milestones:
completing the local deployable Kubernetes configuration, providing a
practical local development workflow, and preparing the configuration
and requirements for AKS deployment.

### Milestone 1 - Complete the local Kubernetes deployment

Existing migration work:

- [x] Local Kubernetes cluster
- [x] PostgreSQL/PostGIS Deployment
- [x] PostgreSQL/PostGIS Service
- [x] Database connectivity from the workstation
- [x] Adminer Deployment
- [x] Adminer Service
- [x] Adminer-to-database communication through Kubernetes networking
- [x] Delta application Deployment
- [x] Delta application Service
- [x] Delta application database configuration
- [x] Delta application container successfully started
- [x] Database migrations successfully executed from the Delta
      application
- [x] Delta development server successfully started inside Kubernetes
- [x] Complete browser-level application validation

Deployment engineering still required:

- [x] Add persistent storage for the PostgreSQL/PostGIS database
- [x] Verify database data survives Pod deletion/recreation and
      Kubernetes restart
- [x] Review persistent storage requirements for `/delta/uploads`
- [x] Implement persistent storage for `/delta/uploads` if required
- [x] Add PostgreSQL readiness/health checking
- [x] Prevent Delta application startup before required database
      services are ready
- [x] Add appropriate startup, readiness and liveness probes for Delta
- [x] Move non-sensitive application configuration to ConfigMaps
- [x] Move credentials and sensitive configuration to Kubernetes
      Secrets
- [x] Define initial CPU and memory resource requests and limits
- [x] Validate core application functionality against the Kubernetes
      database
- [x] Test complete stack recovery by deleting/recreating Pods
- [x] Compare Kubernetes performance with the existing Docker baseline
- [x] Review image tagging and use versioned/immutable image
      references for deployments
- [x] Verify the complete environment can be recreated from the
      committed Kubernetes manifests
- [x] Commit and push the completed Kubernetes deployment
      configuration to the PoC branch

### Milestone 2 - Local Kubernetes developer workflow

The deployable Kubernetes configuration uses a self-contained Delta
image. A separate developer workflow should preserve the fast edit/test
cycle currently provided by Docker Compose.

### Milestone 2 - Developer workflow

- [x] Document the existing Delta development and production image
      build process
- [x] Reproduce the Delta development image build locally
- [x] Define a Kubernetes local-development configuration using the
      developer's local source code
- [x] Provide source mounting or synchronization between the
      workstation and development Pod
- [x] Verify source-code changes can be tested without publishing a
      new remote image for every change
- [x] Keep the local-development configuration clearly separated from
      the deployable/AKS configuration
- [x] Document commands required to start, stop and reset the local
      Kubernetes development environment
- [x] Validate the complete local developer workflow

### Milestone 3A - Initial AKS architecture and handover

The local Kubernetes phase has demonstrated that Delta can be deployed
and operated using Kubernetes and has established the Kubernetes
configuration required as a starting point for AKS.

The objective of this milestone is to define enough of the initial AKS
architecture for the Azure deployment work to begin. Detailed
implementation decisions will then be validated and refined while the
AKS environment is provisioned and Delta is deployed.

- [ ] Define the proposed initial AKS cluster architecture
- [ ] Define initial AKS node pool VM size and permitted scaling/cost
      envelope
- [ ] Identify Kubernetes configuration that must change between local
      Kubernetes and AKS
- [ ] Produce a concise initial AKS implementation/handover guide

Completion of this milestone represents the initial handover point to
the colleague performing the Azure deployment.

### Milestone 3B - AKS implementation and PoC validation

Following the initial architecture handover, the remaining activities
correspond to the Azure deployment and validation phases of the PoC.
Implementation details may be refined based on practical experience
while provisioning and operating the AKS environment.

- [ ] Provision the development AKS cluster and required Azure resources
- [ ] Confirm node count, availability and resilience requirements
- [ ] Validate Kubernetes resource requests/limits against AKS capacity
- [ ] Configure container-registry access
- [ ] Implement persistent storage for PostgreSQL and `/delta/uploads`
- [ ] Decide whether PostgreSQL remains inside Kubernetes for the PoC
      or uses an Azure-managed database
- [ ] Configure ingress and the application public endpoint
- [ ] Configure DNS and TLS/certificate requirements as applicable
- [ ] Implement secrets and application configuration management
- [ ] Deploy Delta to AKS
- [ ] Validate application functionality and persistence
- [ ] Validate basic deployment, recovery and rollback procedures
- [ ] Demonstrate basic application and infrastructure monitoring
- [ ] Assess resource utilization and initial AKS hosting costs
- [ ] Compare estimated AKS costs with the current App Service model
- [ ] Document operational observations, risks and lessons learned
- [ ] Produce the final PoC findings and recommendation

### Current architecture

The local Kubernetes PoC currently consists of:

```text
                         Local workstation
                                │
                  kubectl port-forward :13000
                                │
                                ▼
                     delta-local-app Service
                                │
                                ▼
                      Delta application Pod
                                │
                         DATABASE_URL
                                │
                                ▼
                      delta-local-db Service
                                │
                                ▼
                         PostGIS Pod


                     delta-adminer Service
                                │
                                ▼
                          Adminer Pod
                                │
                                └──────► delta-local-db Service
```

### Image build and deployment work

The Delta repository already contains separate Dockerfiles for the
different image models:

- `Dockerfile.app` provides the lightweight runtime used by the
  bind-mounted Docker Compose development workflow.
- `Dockerfile.dev` creates a self-contained development image including
  the Delta source code and Node dependencies.
- `Dockerfile.prod` creates the optimized production image.

As part of Milestone 2, the development image was successfully
reproduced locally from the existing `Dockerfile.dev`:

```bash
docker build -f Dockerfile.dev -t delta/dev-poc:local .
```

The build completed successfully and produced the local image
`delta/dev-poc:local`. Inspection of the resulting container confirmed
that it contains the Delta application source, `package.json`,
`yarn.lock` and installed `node_modules`.

This validates that the existing Delta development image can be built
locally from the repository rather than relying only on the previously
published `ghcr.io/preventionweb/delta-country:dev-latest` image.

The deployable Kubernetes PoC continues to use the immutable
digest-pinned development image validated during Milestone 1. The
separate `k8s/dev/` configuration is intended for interactive local
development and deliberately uses the developer's current workstation
source instead.

### Local Kubernetes development

The deployable Kubernetes configuration uses a self-contained Delta
container image. This is appropriate for deployment, but it does not
provide the same development experience as the existing Docker Compose
workflow, where the developer's local source tree is bind-mounted
directly into the container.

A separate local-development configuration was therefore created under:

```text
k8s/dev/
```

This keeps workstation-specific development behavior separate from the
deployable Kubernetes configuration that will later be adapted for AKS.

The development Pod uses:

```text
node:24-bookworm-slim
```

rather than requiring a prebuilt Delta image. The Pod initially waits
for source code to become available under `/delta`.

The resulting development model is:

```text
Developer workstation
        ↓
local Delta source
        ↓
sync-source.ps1
        ↓
Kubernetes development Pod /delta
        ↓
yarn install
        ↓
database migrations
        ↓
React Router / Vite development server
```

#### Source synchronization

Docker Compose can directly bind-mount the workstation source directory
into the application container:

```text
.:/delta
```

The Docker Desktop Kubernetes cluster used for this PoC is based on a
kind control-plane container. Kubernetes `hostPath` volumes refer to the
filesystem of that Kubernetes node rather than directly to the Windows
workstation filesystem.

Direct access to the Windows Delta source directory from the Kubernetes
node was investigated. Although Docker Desktop exposed a corresponding
directory hierarchy under:

```text
/run/desktop/mnt/host/d/Remix/DELTA
```

the directory did not contain the workstation files. Inspection of the
kind node mounts also confirmed that the Windows source directory was
not mounted into the Kubernetes node.

A custom kind cluster could technically be created with explicit
additional mounts, but requiring developers to recreate or customize
their Kubernetes cluster was considered undesirable for this PoC.

Instead, a lightweight PowerShell source synchronization script was
added:

```text
k8s/dev/sync-source.ps1
```

The script requires only PowerShell and `kubectl`, which are already
available in the tested Windows development environment.

When first started against a fresh development Pod, the script:

1. waits until a usable development Pod is available;
2. detects whether `/delta/package.json` already exists;
3. performs a complete source bootstrap only when required;
4. excludes workstation-specific directories such as `.git`,
   `node_modules` and `uploads`;
5. leaves the development container to install its Linux dependencies
   and start the React Router/Vite development server;
6. watches the workstation source tree for subsequent changes;
7. automatically copies changed files into the running Pod.

After the initial bootstrap, editing and saving a source file therefore
follows this path:

```text
edit source locally
        ↓
PowerShell FileSystemWatcher detects save
        ↓
changed file copied through kubectl
        ↓
file updated under /delta in the Pod
        ↓
Vite detects change
        ↓
browser reflects the modification
```

This was validated by modifying the admin login page. The change was
reflected directly in the Kubernetes-hosted application without:

- rebuilding a Docker image;
- publishing an image to a registry;
- restarting the Deployment;
- manually identifying a Pod;
- manually running `kubectl cp`.

The synchronization script also waits for a new Running Pod when a
previous development Pod is being terminated, avoiding a race condition
encountered during initial testing.

#### Starting the local development environment

The normal deployable Kubernetes resources can first be applied using:

```bash
kubectl apply -f k8s
```

The dedicated development resources are then applied separately:

```bash
kubectl apply -f k8s/dev
```

On workstations with limited memory, the normal deployable Delta
application should be scaled down while the development application is
being used:

```bash
kubectl scale deployment delta-local-app --replicas=0
```

Source synchronization is then started from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File k8s\dev\sync-source.ps1
```

A fresh Pod is bootstrapped automatically. If source code is already
present, the complete bootstrap is skipped and the script immediately
starts watching for changes.

The development Service can be exposed in another terminal using:

```bash
kubectl port-forward service/delta-local-app-dev 15000:3000
```

The development application is then available at:

```text
http://localhost:15000
```

For example:

```text
http://localhost:15000/en/admin/login
```

#### Stopping local development

The synchronization process and port-forward can be stopped using
`Ctrl+C`.

The development application can then be scaled down:

```bash
kubectl scale deployment delta-local-app-dev --replicas=0
```

If required, the normal deployable Delta application can be restored:

```bash
kubectl scale deployment delta-local-app --replicas=1
```

#### Resetting the development Pod

The development source directory is intentionally ephemeral. To recreate
the development Pod:

```bash
kubectl delete pod -l app=delta-local-app-dev
```

The Deployment creates a replacement Pod. Restarting
`sync-source.ps1` then detects the new Pod, performs the initial source
bootstrap and starts watching for changes again.

#### Development performance and workstation resources

During validation, the existing Docker Compose development environment
itself showed a very slow first application compilation. Loading the
admin login route took approximately five minutes during one controlled
test, while application-container memory increased from approximately
351 MiB to a peak of approximately 1.3 GiB.

The Kubernetes development Pod also showed significant memory pressure.
Linux cgroup analysis showed that most of the apparent memory usage was
filesystem/page-cache accounting rather than Node process memory. A
representative idle measurement was approximately:

```text
anon       ~590 MiB
file       ~2.8 GiB
```

When both the deployable Delta Pod and the separate development Delta
Pod were running on the 16 GB test workstation, the development Pod was
eventually OOM-killed during application compilation.

Scaling down the duplicate deployable Delta application while using the
development Pod provided sufficient headroom. The development
application then completed the same workflow without restarting, and
live source modifications continued to work correctly.

The PoC therefore recommends avoiding simultaneous execution of both
Delta application variants on resource-constrained local workstations.
The unusually slow initial development compilation is not specific to
Kubernetes, since similar behavior was reproduced using the existing
Docker Compose development environment.

#### Portability

The PowerShell synchronization implementation validates the complete
workflow on the Windows/Docker Desktop environment used for this PoC.

The Kubernetes development manifests themselves are not intended to be
Windows-specific. Developers using Linux, macOS, another local
Kubernetes implementation or a cluster configuration that supports
direct host mounts may use a different source synchronization or
mounting mechanism.

Providing and validating every workstation-specific implementation is
outside the scope of this PoC. The important requirement demonstrated
here is that local source changes can be tested against Kubernetes
without publishing a new container image for every edit.

### Future CI/CD integration

The Delta project is transitioning toward automated container build and
deployment rather than relying only on the existing hosting process.

The Kubernetes PoC should therefore consider how the architecture could
eventually support a CI/CD workflow such as:

```text
Developer commit
       ↓
Source repository
       ↓
CI pipeline
       ↓
Build and test Delta image
       ↓
Publish versioned image
       ↓
Container registry
       ↓
Deployment pipeline
       ↓
AKS
```

Implementing the complete CI/CD pipeline is not required for the initial
Kubernetes PoC, but the Kubernetes manifests and image strategy should
avoid design decisions that would prevent this evolution.

### Next milestone

The PoC has now completed the main **local deployment engineering** and
**local developer workflow** activities.

The local Kubernetes deployment has been validated for database and
uploads persistence, PostgreSQL readiness, Delta database-startup
dependency handling, application health probes, configuration and secret
separation, resource requests and limits, stack recovery, functional
behavior and performance relative to the existing Docker baseline.

The deployable Delta image is referenced using an immutable digest, and
the complete Kubernetes environment has been successfully recreated from
the committed manifests.

The local developer workflow has also been validated. A separate
`k8s/dev/` configuration allows developers to work with their current
local Delta source without rebuilding and publishing a container image
for every change. Initial source bootstrap and subsequent source changes
are handled by the synchronization script, while keeping this
workstation-specific development configuration separate from the
deployable Kubernetes configuration.

The next activity is **Milestone 3A - Initial AKS architecture and
handover**. This will define the initial cluster architecture, node-pool
sizing and cost envelope, identify the changes required to move the
validated local Kubernetes configuration to AKS, and provide a concise
handover guide for the Azure deployment.

Following this handover, the remaining AKS implementation and PoC
validation activities will continue under Milestone 3B.
