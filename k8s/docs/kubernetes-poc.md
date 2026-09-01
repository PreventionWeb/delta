# Delta Kubernetes Proof of Concept

## 1. Purpose

This proof of concept evaluates the migration of the Delta application from its existing Docker-based local deployment model to Kubernetes, with the longer-term objective of assessing deployment to Azure Kubernetes Service (AKS).

The PoC follows an incremental approach. Rather than attempting to migrate the complete Delta stack at once, each component is migrated and validated independently before adding the next dependency.

The initial sequence is:

1. PostgreSQL/PostGIS database
2. Adminer database administration interface
3. Delta application
4. Complete application validation
5. Container image build and developer workflow review
6. Preparation for deployment to AKS

This approach makes it easier to identify whether issues originate from the application, container configuration, Kubernetes networking, image distribution, or dependencies between components.

## 2. What is Kubernetes?

Kubernetes is an open-source container orchestration platform used to deploy, manage and scale containerized applications.

Docker packages and runs individual application containers. Kubernetes adds an orchestration layer that manages how those containers are deployed, networked, restarted, scaled and updated.

A key Kubernetes principle is **desired state**: the required application state is declared in configuration, and Kubernetes continuously attempts to keep the running environment aligned with that declaration.

For example, a Kubernetes Deployment can specify that one instance of the Delta application should be running. If the corresponding Pod fails, Kubernetes detects that the actual state no longer matches the desired state and attempts to create a replacement.

## 3. Why Kubernetes for Delta?

The PoC evaluates whether Kubernetes can provide Delta with:

- repeatable and declarative deployments;
- improved application resilience;
- scaling capabilities;
- separation of application configuration from container images;
- stable networking between application components;
- portability between local environments and managed Kubernetes platforms;
- a deployment model compatible with Azure Kubernetes Service (AKS).

The PoC does not assume that Kubernetes is necessarily the preferred production hosting solution. Operational complexity, architecture and cost are considered separately in the Delta hosting-options assessment.

The purpose of this document is therefore primarily to document the Kubernetes implementation and the practical migration process.

## 4. Key concepts

### Pod

The smallest deployable workload in Kubernetes. A Pod normally contains one application container.

Pods are considered disposable. Kubernetes may replace a Pod as part of failure recovery, configuration changes or application updates.

### Deployment

Defines and maintains the desired configuration and number of application Pods.

For example, the database Deployment defines the PostGIS container that Kubernetes should keep running.

### Service

Provides a stable network endpoint through which Pods can be reached.

Pods may be replaced and their IP addresses may change. Services therefore provide stable names and addresses that other application components can use.

For example, Adminer and Delta connect to the database using the Kubernetes Service name `delta-local-db` rather than the IP address of the current database Pod.

### ConfigMap

Stores non-sensitive application configuration independently from the container image.

### Secret

Stores sensitive configuration such as credentials or keys.

For the initial local PoC, test database credentials and development-only values are defined directly in the Deployment configuration for simplicity. Production credentials should be handled using an appropriate secrets-management mechanism.

### Port forwarding

`kubectl port-forward` provides temporary access from the local workstation to a Kubernetes resource.

For example:

```bash
kubectl port-forward service/delta-local-db 15432:5432
```

makes the Kubernetes database temporarily accessible from the workstation on `localhost:15432`, while PostgreSQL continues to use its normal port `5432` inside Kubernetes.

The forwarding exists only while the `kubectl port-forward` command is running.

## 5. Existing Delta architecture and baseline

Before starting the migration, the latest `dev` branch was restored and the existing Delta Docker environment was validated.

The existing local Docker Compose environment contains three services:

| Service   | Image                    | Host port | Container port | Purpose                           |
| --------- | ------------------------ | --------: | -------------: | --------------------------------- |
| `db`      | `postgis/postgis:17-3.5` |      5432 |           5432 | PostgreSQL/PostGIS database       |
| `app`     | `delta/local-app`        |      3000 |           3000 | Delta application                 |
| `adminer` | `adminer`                |      8080 |           8080 | Database administration interface |

The existing Docker-based environment remains operational during the Kubernetes PoC. The Kubernetes configuration must not interfere with the existing Docker Desktop environment or other Docker-based development environments.

### Delta container models

Review of the repository identified three container/deployment models serving different purposes.

#### Local development

The standard `docker-compose.yml` uses `Dockerfile.app` to create the local development runtime image:

```text
delta/local-app
```

This image does not contain the Delta application source code itself. Docker Compose bind-mounts the local source directory into `/delta` inside the running container.

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

This provides a convenient development workflow because developers can modify source files locally without rebuilding and publishing a new container image after each change.

The image is therefore primarily a **local development runtime image** rather than a self-contained deployable Delta application image.

#### Deployable development image

The repository also contains `Dockerfile.dev`, which builds a self-contained development image.

Unlike `Dockerfile.app`, it installs the application dependencies and copies the Delta source code into the image. The existing shared development environment uses:

```text
ghcr.io/preventionweb/delta-country:dev-latest
```

This image can therefore be executed without mounting the source tree from the developer workstation and is more appropriate for Kubernetes.

#### Production image

A separate `Dockerfile.prod` provides the production build. It uses a multi-stage build process in which the application is built in a builder stage and the required runtime artifacts are copied into the final production image.

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

For the Kubernetes PoC, the existing self-contained development image is used initially rather than reproducing the local Docker Compose bind-mount model.

### Performance baseline

The first Delta page was observed taking approximately **2.2 minutes** to load in the existing local Docker environment, with a later measured request reaching approximately **287 seconds** before returning HTTP 200.

This is recorded as a baseline so that existing application performance is not incorrectly attributed to Kubernetes during subsequent testing.

## 6. Local Kubernetes environment

Kubernetes was enabled using Docker Desktop.

The cluster was validated using:

```bash
kubectl cluster-info
kubectl get nodes
kubectl get pods -A
```

A simple nginx Deployment was initially used to validate basic Kubernetes functionality and understand the relationship between:

- Deployment
- Pod
- Service
- port forwarding

The Kubernetes PoC work is maintained in a dedicated Git branch. After the Delta repository moved to the new GitHub organization, the PoC commit was reapplied on a branch based on the new repository's `dev` branch.

Kubernetes manifests are stored separately under:

```text
k8s/
```

The manifests are separated by component so that each Kubernetes resource remains easy to understand and maintain.

## 7. Migration steps

### Step 1 - Migrate the PostgreSQL/PostGIS database

The database was selected as the first Delta component to migrate because the Delta application depends on it.

A Kubernetes Deployment was created using the same PostGIS image as the existing Docker Compose environment:

```yaml
image: postgis/postgis:17-3.5
```

The initial database Pod failed immediately after startup.

Inspection was performed using:

```bash
kubectl describe pod <pod-name>
kubectl logs <pod-name>
```

The Kubernetes configuration initially contained no environment variables, while the PostGIS container requires PostgreSQL initialization parameters.

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

A Kubernetes Service was created to provide a stable network endpoint for the database:

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

The existing Docker PostgreSQL instance already uses `localhost:5432`. This does not conflict with the Kubernetes Service because the Service port exists inside the Kubernetes network rather than on the workstation.

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

This confirmed that the PostGIS database was running successfully inside Kubernetes and accessible through the Kubernetes Service.

### Step 3 - Migrate Adminer

Adminer was selected as the second component because it depends on the database and provides a convenient way to validate communication between Kubernetes workloads.

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

This demonstrates an important Kubernetes networking principle: application components communicate using stable Kubernetes Service names rather than Pod IP addresses.

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

Because the existing Docker Adminer already uses `localhost:8080`, the Kubernetes Adminer was temporarily exposed on a different workstation port:

```bash
kubectl port-forward service/delta-adminer 18080:8080
```

Adminer was then accessed through:

```text
http://localhost:18080
```

A successful login to the PostgreSQL/PostGIS database through Adminer confirmed that:

- the Adminer Pod was running;
- the Adminer Service was working;
- Kubernetes DNS resolved `delta-local-db`;
- Adminer could communicate with the database Service;
- the database Service correctly routed traffic to the PostGIS Pod.

### Step 4 - Review the Delta image build model

Before deploying the Delta application, the existing image build process was reviewed.

An initial inspection of the locally built image showed that `/delta` was empty when the image was run without Docker Compose:

```bash
docker run --rm delta/local-app ls -la /delta
```

This confirmed that the local `delta/local-app` image depends on the Docker Compose bind mount and is not self-contained.

Review of `Dockerfile.dev`, `Dockerfile.prod`, `docker-compose.dev.yml` and `docker-compose.prod.yml` showed that Delta already has separate self-contained images for deployed development and production environments.

This avoided unnecessarily redesigning the existing container build process as part of the Kubernetes PoC.

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

The Service provides a stable internal endpoint for the Delta application independently of the individual application Pod.

### Step 6 - Create the Delta application Deployment

The application was configured to connect to PostgreSQL through the Kubernetes database Service:

```yaml
env:
  - name: DATABASE_URL
    value: "postgresql://postgres:postgres@delta-local-db:5432/dts-shared-01"

  - name: SESSION_SECRET
    value: "not-random-dev-secret"

  - name: EMAIL_TRANSPORT
    value: "file"

  - name: AUTHENTICATION_SUPPORTED
    value: "form"

  - name: PUBLIC_URL
    value: "http://localhost:13000"

  - name: EMAIL_FROM
    value: '"Example (from Kubernetes PoC)" <no-reply@example.com>'

  - name: TZ
    value: "UTC"
```

The important networking difference from Docker Compose is the database hostname.

Docker Compose uses:

```text
db
```

Kubernetes uses:

```text
delta-local-db
```

because `delta-local-db` is the Kubernetes Service providing access to PostgreSQL.

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

Kubernetes attempted to retrieve this image from Docker Hub and returned:

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

This demonstrated that the locally built Docker image was not available in the Kubernetes node image store.

More importantly, the earlier image inspection had already shown that `delta/local-app` was not the appropriate deployable image because it depends on the local source-code bind mount.

The Deployment was therefore changed to the existing self-contained development image:

```yaml
image: ghcr.io/preventionweb/delta-country:dev-latest
```

Kubernetes successfully retrieved this image from the container registry.

### Step 8 - Validate the self-contained image

Before starting Delta itself, the application Deployment was temporarily configured with a diagnostic command:

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

Inspection of `/delta` confirmed that the image contains the complete Delta application, including the application source, `package.json`, `yarn.lock` and installed dependencies.

The temporary diagnostic command was then removed so that the image could execute its normal startup command.

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

At this stage, Kubernetes reported all three Delta components as running:

```text
delta-adminer-app    1/1 Running
delta-local-app      1/1 Running
delta-local-db       1/1 Running
```

This represents the first complete startup of the Delta application stack inside the local Kubernetes cluster.

### Step 10 - Expose Delta locally for browser validation

The Delta Service can be temporarily exposed to the workstation using:

```bash
kubectl port-forward service/delta-local-app 13000:3000
```

The Kubernetes-hosted application can then be accessed at:

```text
http://localhost:13000
```

Browser-level validation confirmed that the Delta application is accessible through the Kubernetes Service and that application routes operate correctly. In particular, the authentication page was successfully validated at:

```text
http://localhost:13000/en/admin/login
```

The equivalent Docker Compose route is:

```text
http://localhost:3000/en/admin/login
```

This keeps the existing Docker Compose and Kubernetes environments separate:

```text
Docker Compose Delta     http://localhost:3000
Kubernetes Delta         http://localhost:13000
```

This provides a convenient mechanism for direct functional and performance comparison between the existing local Docker development environment and the Kubernetes PoC.

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

The PostGIS Pod reports `Running` and database connectivity was successfully tested using:

```bash
psql -h localhost -p 15432 -U postgres -d dts-shared-01
```

### Adminer

Adminer was successfully accessed through:

```text
http://localhost:18080
```

and successfully connected to the PostgreSQL/PostGIS database using the internal Kubernetes Service `delta-local-db`.

### Delta application

The Delta application Pod successfully starts using:

```text
ghcr.io/preventionweb/delta-country:dev-latest
```

Application startup successfully:

1. connects to the Kubernetes-hosted PostgreSQL database;
2. applies the required database migrations;
3. starts the React Router/Vite development server;
4. listens on port 3000 inside the Pod.

The complete Kubernetes stack reports:

```text
delta-adminer-app    1/1 Running
delta-local-app      1/1 Running
delta-local-db       1/1 Running
```

Browser-level application validation is performed by forwarding the Delta Service:

```bash
kubectl port-forward service/delta-local-app 13000:3000
```

and accessing:

```text
http://localhost:13000
```

### Existing Docker environment

The existing Docker-based Delta environment remains operational independently of the Kubernetes environment.

This allows direct comparison between the existing deployment and the Kubernetes PoC during the migration.

## 10. Current status and next steps

The following components have now been migrated:

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
- [x] Database migrations successfully executed from the Delta application
- [x] Delta development server successfully started inside Kubernetes
- [x] Complete browser-level application validation
- [ ] Validate core application functionality against the Kubernetes database
- [ ] Compare Kubernetes performance with the Docker baseline
- [ ] Review persistent storage requirements, particularly `/delta/uploads`
- [ ] Review ConfigMap and Secret usage
- [ ] Review readiness and liveness probes
- [ ] Review resource requests and limits
- [ ] Document the Delta development and production image build process in detail
- [ ] Reproduce the Delta image build locally
- [ ] Document a developer-friendly local Kubernetes workflow
- [ ] Commit and push completed Kubernetes configuration to the PoC branch
- [ ] Review container registry strategy for Azure
- [ ] Prepare Azure Kubernetes Service deployment
- [ ] Deploy and validate the PoC on AKS
- [ ] Assess future CI/CD integration

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

The PoC identified an important distinction between Delta's local development and deployment container models.

The current local Docker Compose workflow prioritizes rapid development by bind-mounting the developer's source tree into the container.

The existing development and production deployment workflows instead use self-contained container images.

The next phase of the PoC will document and validate the complete image lifecycle:

```text
Delta source
     ↓
Dockerfile.dev / Dockerfile.prod
     ↓
container build
     ↓
tagged image
     ↓
container registry
     ↓
Kubernetes
     ↓
AKS
```

This is important so that the Kubernetes PoC remains reproducible and does not depend on an image whose build process is treated as an external prerequisite.

### Local Kubernetes development

The PoC will also assess how developers can efficiently work with a local Kubernetes environment.

The existing Docker Compose development workflow provides a fast feedback loop because application source code is mounted directly from the developer workstation.

A Kubernetes development workflow should ideally preserve a reasonably fast edit/build/test cycle without requiring developers to manually publish every development image to a remote registry after each code change.

Possible approaches will be evaluated after the basic Kubernetes deployment is complete.

### Future CI/CD integration

The Delta project is transitioning toward automated container build and deployment rather than relying only on the existing hosting process.

The Kubernetes PoC should therefore consider how the architecture could eventually support a CI/CD workflow such as:

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

Implementing the complete CI/CD pipeline is not required for the initial Kubernetes PoC, but the Kubernetes manifests and image strategy should avoid design decisions that would prevent this evolution.

### Next milestone

The basic local application migration is now operational. The Delta application, PostgreSQL/PostGIS database and Adminer are running successfully inside Kubernetes, and basic browser-level application routing has been validated against the equivalent Docker Compose environment.

The next milestone is to complete core functional validation and then move from **application migration** toward **deployment engineering**. This includes persistent storage, configuration and secret management, health and startup checks, resource requests and limits, image lifecycle and registry integration, local Kubernetes developer workflow, and preparation for deployment to AKS.
