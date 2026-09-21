# Despliegue 24/7 en un VPS

Guía paso a paso para tener NutriTrack funcionando de forma permanente en un
servidor propio, con HTTPS automático, copias de seguridad y actualizaciones.

**Coste orientativo: 4-5 €/mes.** Tiempo de puesta en marcha: ~30 minutos.

---

## 1. Elegir el VPS

| Proveedor | Plan recomendado | Precio |
|---|---|---|
| **Hetzner** | CX22 — 2 vCPU, 4 GB RAM, 40 GB SSD | ~4,5 €/mes |
| DigitalOcean | Basic Droplet — 1 vCPU, 2 GB | ~6 $/mes |
| Vultr | Cloud Compute — 1 vCPU, 2 GB | ~6 $/mes |
| Oracle Cloud | Ampere A1 (ARM) — 4 vCPU, 24 GB | **gratis** (con limitaciones) |

**Mínimo 2 GB de RAM.** El build del frontend con Vite consume bastante; con
1 GB puede quedarse sin memoria. Con 4 GB vas sobrado.

Ubicación: elige el datacenter más cercano a tus usuarios.

Sistema operativo: **Ubuntu 24.04 LTS**.

> Guarda la clave SSH que te dé el proveedor al crear el servidor. La necesitas
> para todo lo que viene después.

---

## 2. Preparar el servidor

Conéctate por SSH (en Windows, desde PowerShell):

```bash
ssh root@TU_IP
```

### 2.1 Actualizar y crear un usuario sin privilegios

Trabajar como `root` es cómodo pero peligroso. Creemos un usuario normal:

```bash
apt update && apt upgrade -y

adduser nutri
usermod -aG sudo nutri

# Copia tu clave SSH al usuario nuevo
mkdir -p /home/nutri/.ssh
cp ~/.ssh/authorized_keys /home/nutri/.ssh/
chown -R nutri:nutri /home/nutri/.ssh
chmod 700 /home/nutri/.ssh
chmod 600 /home/nutri/.ssh/authorized_keys
```

Comprueba en **otra terminal** que puedes entrar como `nutri` antes de seguir:

```bash
ssh nutri@TU_IP
```

### 2.2 Cortafuegos

Solo deben estar abiertos SSH, HTTP y HTTPS:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp    # HTTP/3
sudo ufw enable
sudo ufw status
```

> Fíjate en que **no abrimos el 5432** (PostgreSQL) ni el 5000 (API). El
> `docker-compose.prod.yml` los deja en la red interna de Docker, así que no
> son alcanzables desde internet. Esa es la razón de no publicarlos.

### 2.3 Instalar Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

**Cierra la sesión y vuelve a entrar** para que el grupo `docker` surta efecto.

```bash
docker --version
docker compose version
```

---

## 3. Subir el proyecto

```bash
sudo mkdir -p /opt/nutritrack
sudo chown $USER:$USER /opt/nutritrack
cd /opt/nutritrack

git clone https://github.com/cartup90/Nutritrack.git .
```

Si el repositorio fuera privado, necesitarás un token de acceso o una clave de
despliegue.

---

## 4. Configurar

```bash
cp .env.example .env
nano .env
```

### 4.1 El dominio

**Opción A — sin dominio propio (HTTPS desde hoy, gratis)**

Averigua tu IP pública y usa `sslip.io`:

```bash
curl -s ifconfig.me
```

En `.env`:

```env
DOMAIN=nutritrack.203.0.113.45.sslip.io     # ← tu IP real
```

`sslip.io` es un DNS comodín: cualquier nombre que termine en `TU-IP.sslip.io`
resuelve a esa IP. Let's Encrypt emite el certificado igual, así que **la PWA
se instala y el service worker funciona** sin comprar nada.

**Opción B — con dominio propio**

En el panel de tu registrador, crea un registro DNS:

| Tipo | Nombre | Valor |
|---|---|---|
| A | `nutritrack` | `TU_IP` |

Espera a que propague (de minutos a unas horas) y comprueba:

```bash
dig +short nutritrack.tudominio.com
```

Cuando devuelva tu IP:

```env
DOMAIN=nutritrack.tudominio.com
```

### 4.2 El resto de valores

```env
ACME_EMAIL=tu@email.com

# Genera una contraseña larga para la base de datos:
#   openssl rand -base64 24
POSTGRES_PASSWORD=...

# Y un secreto distinto para los tokens:
#   openssl rand -base64 48
JWT_SECRET=...

DEEPSEEK_API_KEY=sk-tu-api-key-real
```

> **Nunca reutilices el `JWT_SECRET` de desarrollo.**

---

## 5. Desplegar

```bash
cd /opt/nutritrack
./scripts/deploy.sh
```

El script hace todo: copia de seguridad previa, construye las imágenes, levanta
los servicios, **aplica las migraciones de esquema** y verifica que la API
responde.

Al terminar te dará la URL. Ábrela y comprueba que carga.

### Si algo falla

```bash
docker compose -f docker-compose.prod.yml ps          # estado
docker compose -f docker-compose.prod.yml logs -f api # logs de la API
docker compose -f docker-compose.prod.yml logs caddy  # problemas de TLS
```

---

## 6. Copias de seguridad

**Sin copias, un día lo pierdes todo.** La base de datos y las fotos viven en
volúmenes de Docker: si el disco muere, se van con él.

### 6.1 Automatizar

```bash
mkdir -p /var/backups/nutritrack
crontab -e
```

Añade:

```cron
# Copia diaria a las 3:00, conservando 14 días
0 3 * * * cd /opt/nutritrack && ./scripts/backup.sh /var/backups/nutritrack >> /var/log/nutritrack-backup.log 2>&1
```

### 6.2 Sacarlas del servidor

Una copia en el mismo servidor **no protege contra perder el servidor**.
Llévalas fuera con `rclone` (Google Drive, S3, Backblaze…):

```bash
sudo apt install -y rclone
rclone config          # asistente interactivo
```

Y añade al cron:

```cron
30 3 * * * rclone sync /var/backups/nutritrack remoto:nutritrack-backups
```

### 6.3 Restaurar

```bash
./scripts/restore.sh /var/backups/nutritrack/nutritrack_2026-01-15_030000.tar.gz
```

Pide confirmación escribiendo `RESTAURAR` y restaura base de datos **y** fotos.

### 6.4 Probar la restauración

Una copia que nunca se ha restaurado no es una copia. Prueba el procedimiento
al menos una vez, en un VPS de prueba o en tu PC.

---

## 7. Actualizar

Cuando hagas cambios y los subas a GitHub:

```bash
ssh nutri@TU_IP
cd /opt/nutritrack
./scripts/deploy.sh
```

El script actualiza el código, reconstruye y **aplica las migraciones**.

> **Por qué importa el paso de migraciones:** el
> `docker-entrypoint-initdb.d` de PostgreSQL **solo se ejecuta cuando el volumen
> de datos está vacío**. En la primera instalación crea el esquema, pero en
> cualquier actualización posterior no hace nada. Si añades una columna y no
> aplicas la migración, la API empezará a fallar con `column does not exist`.
> Por eso `deploy.sh` ejecuta `setup-db.mjs` en cada despliegue: `schema.sql` es
> idempotente y aplicarlo siempre es seguro.

---

## 8. Operación diaria

```bash
cd /opt/nutritrack
C="docker compose -f docker-compose.prod.yml"

$C ps                     # estado de los servicios
$C logs -f api            # logs en vivo
$C logs --tail 100 caddy  # problemas de certificado
$C restart api            # reiniciar un servicio
$C down                   # parar (los volúmenes se conservan)
$C up -d                  # arrancar
```

### Comprobar que sigue vivo

```bash
curl -fsS https://TU_DOMINIO/api/health
```

Devuelve `{"status":"ok",...}` si todo va bien. Puedes añadirlo a un monitor
externo gratuito (UptimeRobot, BetterStack) para que te avise si se cae.

### Consumo de recursos

```bash
docker stats --no-stream
df -h          # espacio en disco
free -h        # memoria
```

Los logs de Caddy rotan solos (10 MB × 5 archivos). Si el disco se llena,
revisa sobre todo `/var/lib/docker`.

---

## 9. Seguridad

Lo que ya viene resuelto:

- Solo Caddy expone puertos; PostgreSQL y la API están en la red interna
- HTTPS obligatorio con redirección automática desde HTTP
- Cabeceras de seguridad (HSTS, `X-Content-Type-Options`, `Permissions-Policy`…)
- La API key de DeepSeek vive solo en el `.env` del servidor
- Contraseñas con bcrypt, sesiones con JWT
- Las fotos se re-codifican y se les elimina el EXIF (geolocalización)

Lo que te toca a ti:

- [ ] **Deshabilitar el login por contraseña de SSH** (usa solo clave):
      en `/etc/ssh/sshd_config`, `PasswordAuthentication no`, y `systemctl reload ssh`
- [ ] `apt upgrade` periódico (o `unattended-upgrades` para automático)
- [ ] Contraseña de PostgreSQL larga y distinta de la de desarrollo
- [ ] `JWT_SECRET` propio del servidor
- [ ] Copias de seguridad saliendo del servidor

---

## 10. Problemas frecuentes

**«El certificado no se emite»**
El puerto 80 debe estar accesible para el desafío de Let's Encrypt, y el
dominio debe resolver a la IP. Comprueba:
```bash
dig +short TU_DOMINIO
sudo ufw status
docker compose -f docker-compose.prod.yml logs caddy | grep -i acme
```
Si has hecho muchas pruebas, Let's Encrypt aplica límites. Usa
`ACME_STAGING=true` mientras pruebas y pon `false` al terminar.

**«column ... does not exist»**
Falta aplicar la migración:
```bash
docker compose -f docker-compose.prod.yml exec -T api node scripts/setup-db.mjs
```

**«La contraseña de PostgreSQL no funciona tras cambiarla en .env»**
La contraseña **se fija en la primera inicialización del volumen**. Cambiarla en
`.env` después no la actualiza. Opciones: volver a la anterior, o cambiar la
contraseña dentro de PostgreSQL con `ALTER USER`, o **recrear el volumen**
(`down -v`, que borra los datos — solo con copia de seguridad reciente).

**«No tengo espacio en disco»**
Suele ser Docker acumulando imágenes:
```bash
docker system prune -a --volumes   # ¡--volumes borra datos! úsalo con cuidado
docker image prune -f              # solo imágenes huérfanas, seguro
```

**«El build se queda sin memoria»**
Amplía swap (útil en VPS de 1-2 GB):
```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 12. Oracle Cloud Always Free (0 €)

Oracle ofrece **4 vCPU ARM y 24 GB de RAM gratis para siempre**, muy por encima
de lo que dan los VPS de pago baratos. Es la mejor relación potencia/precio si
el presupuesto es ajustado.

### 12.1 Crear la instancia

1. Cuenta en [cloud.oracle.com](https://cloud.oracle.com). Pide tarjeta para
   verificar identidad, **pero no cobra** si te quedas en Always Free.
2. Elige una región cercana. Si tu región no tiene capacidad ARM, prueba otra.
3. **Create Instance**:
   - **Image**: Ubuntu 24.04 (variante **aarch64** para ARM)
   - **Shape**: `VM.Standard.A1.Flex` → 2 OCPU / 12 GB sobra de largo
     (el máximo gratuito es 4 OCPU / 24 GB)
   - **SSH keys**: sube tu clave pública
4. Anota la **IP pública**.

> **La capacidad ARM se agota a menudo.** Si te dice *"Out of host capacity"*,
> prueba otra **Availability Domain** (AD-1, AD-2, AD-3) o reintenta más tarde.
> Es lo más frustrante de Oracle y no depende de ti.

### 12.2 ⚠️ La trampa: hay DOS cortafuegos

Este es el error que hace perder más tiempo con Oracle. **No basta con abrir
los puertos en la consola web**: la instancia trae además reglas de `iptables`
que bloquean todo salvo SSH. Hay que abrir los puertos en **los dos sitios**.

**a) En la consola web** — Networking → VCN → Security Lists → Default:
añade reglas de entrada para `0.0.0.0/0` en TCP 80 y TCP 443.

**b) Dentro de la instancia** — por SSH:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

Sin el paso (b), Caddy **no podrá validar el dominio** y el certificado nunca
se emitirá, aunque la Security List esté bien configurada.

### 12.3 El resto es igual

A partir de aquí sigue la guía desde el **apartado 2.1** (crear usuario,
instalar Docker, clonar, configurar y `./scripts/deploy.sh`).

No hace falta tocar nada del proyecto: las imágenes se construyen nativamente
para ARM64. Verificado que `sharp` procesa imágenes y elimina el EXIF en ARM64,
que es lo único que podía fallar.

### 12.4 Si el puerto 80 no está disponible

Caddy necesita el puerto 80 para el desafío de Let's Encrypt. Si tu proveedor lo
bloquea, añade esto al `Caddyfile` dentro del bloque global para usar el desafío
por DNS o el puerto 8443:

```
{
    https_port 8443
}
```

---

## 11. Lista de verificación final

- [ ] VPS creado, actualizado y con usuario sin privilegios
- [ ] Cortafuegos activo (solo 22, 80, 443)
- [ ] Docker instalado y funcionando sin `sudo`
- [ ] Proyecto en `/opt/nutritrack` con `.env` completo
- [ ] `DOMAIN` configurado y resolviendo a la IP
- [ ] `./scripts/deploy.sh` completado sin errores
- [ ] `https://TU_DOMINIO` carga y funciona el login
- [ ] Copia de seguridad manual probada (`./scripts/backup.sh`)
- [ ] Cron de copias configurado y **saliendo del servidor**
- [ ] Restauración probada al menos una vez
- [ ] Monitor externo apuntando a `/api/health`
- [ ] `PasswordAuthentication no` en SSH
- [ ] La PWA se instala desde el móvil
