# Delta Kubernetes Proof of Concept

## 1. Purpose

This proof of concept evaluates the migration of the Delta application from its existing Docker-based local deployment model to Kubernetes, with the longer-term objective of assessing deployment to Azure Kubernetes Service (AKS).

The PoC follows an incremental approach. Rather than attempting to migrate the complete Delta stack at once, each component is migrated and validated independently before adding the next dependency.

The initial sequence is:

1. PostgreSQL/PostGIS database
2. Adminer database administration interface
3. Delta application
4. Complete application validation
5. Preparation for deployment to AKS

This approach makes it easier to identify whether issues originate from the application, container configuration, Kubernetes networking, or dependencies between components.

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

For example, Adminer connects to the database using the Kubernetes Service name `delta-local-db` rather than the IP address of the current database Pod.

### ConfigMap

Stores non-sensitive application configuration independently from the container image.

### Secret

Stores sensitive configuration such as credentials or keys.

For the initial local PoC, test database credentials are defined directly in the Deployment configuration for simplicity. Production credentials should be handled using an appropriate secrets-management mechanism.

### Port forwarding

`kubectl port-forward` provides temporary access from the local workstation to a Kubernetes resource.

For example:

```bash
kubectl port-forward service/delta-local-db 15432:5432
```

makes the Kubernetes database temporarily accessible from the workstation on `localhost:15432`, while PostgreSQL continues to use its normal port `5432` inside Kubernetes.

The forwarding exists only while the `kubectl port-forward` command is running.

## 5. Existing Delta architecture and baseline

Before starting the migration, the latest `dev` branch was pulled and the existing Delta Docker environment was restored and validated.

The existing Docker Compose environment contains three services:

| Service   | Image                    | Host port | Container port | Purpose                           |
| --------- | ------------------------ | --------: | -------------: | --------------------------------- |
| `db`      | `postgis/postgis:17-3.5` |      5432 |           5432 | PostgreSQL/PostGIS database       |
| `app`     | `delta/local-app`        |      3000 |           3000 | Delta application                 |
| `adminer` | `adminer`                |      8080 |           8080 | Database administration interface |

The existing Docker-based environment remains operational during the Kubernetes PoC. The Kubernetes configuration must not interfere with the existing Docker Desktop environment or other Docker-based development environments.

### Performance baseline

The first Delta page currently takes approximately **2.2 minutes** to load in the existing local Docker environment.

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

The Kubernetes PoC work is maintained in a dedicated Git branch:

```bash
git checkout -b kubernetes-poc
```

Kubernetes manifests are stored separately under:

```text
k8s/
```

The initial structure is:

```text
k8s/
├── db-deployment.yaml
├── db-service.yaml
├── adminer-deployment.yaml
└── adminer-service.yaml
```

Additional manifests will be added as further Delta components are migrated.

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

At this stage, two components of the Delta environment are running and communicating successfully inside Kubernetes.

## 8. Issues and resolutions

| Issue                                                               | Cause                                                                         | Resolution                                                                                                                            |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| PostGIS Pod started and immediately terminated                      | Required PostgreSQL environment variables were missing                        | Added `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` to the database Deployment                                               |
| Database was initially configured with port 15432 inside Kubernetes | Host ports and Kubernetes internal ports were initially treated as equivalent | Restored PostgreSQL to its standard internal port 5432 and used port forwarding to map workstation port 15432 to Kubernetes port 5432 |
| Initial Service still referenced `delta-web`                        | Service configuration originated from the initial nginx/web test              | Removed the obsolete Service and created `delta-local-db` with the correct selector                                                   |
| Adminer initially used Docker-style database hostname `db`          | Kubernetes workloads should use the Kubernetes Service name                   | Configured `ADMINER_DEFAULT_SERVER` as `delta-local-db`                                                                               |
| Existing Docker services already use ports 5432 and 8080            | Docker host ports must remain available during the PoC                        | Used local ports 15432 and 18080 for Kubernetes port-forward testing                                                                  |

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

### Existing Docker environment

The existing Docker-based Delta environment remains operational independently of the Kubernetes environment.

This allows direct comparison between the existing deployment and the Kubernetes PoC during the migration.

## 10. Current status and next steps

The following components have been migrated and validated:

- [x] Local Kubernetes cluster
- [x] PostgreSQL/PostGIS Deployment
- [x] PostgreSQL/PostGIS Service
- [x] Database connectivity from the workstation
- [x] Adminer Deployment
- [x] Adminer Service
- [x] Adminer-to-database communication through Kubernetes networking
- [ ] Delta application Deployment
- [ ] Delta application Service
- [ ] Delta application configuration
- [ ] Complete application validation
- [ ] Compare Kubernetes performance with the Docker baseline
- [ ] Review configuration and secrets management
- [ ] Commit completed Kubernetes configuration to the PoC branch
- [ ] Prepare Azure Kubernetes Service deployment
- [ ] Deploy and validate the PoC on AKS

The next implementation step is to migrate the **Delta application itself**.

Unlike the database and Adminer, this component has additional dependencies and application configuration. The existing Docker Compose configuration should therefore be reviewed before creating the Kubernetes Deployment so that environment variables, database connectivity and other application-specific requirements are reproduced correctly.
