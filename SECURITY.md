# Política de seguridad · Security policy

> 🇪🇸 Español primero · 🇬🇧 English below

## Español

### Estado

El proyecto está en **fase de planificación**: todavía no hay código ni ninguna instancia en producción. Aun así, agradecemos los informes sobre fallos de **diseño** en el protocolo o en el modelo de amenazas.

### Cómo informar de una vulnerabilidad

- **No abras un *issue* público.**
- Usa el **reporte privado de vulnerabilidades de GitHub**: pestaña **Security → Report a vulnerability** de este repositorio ([enlace directo](../../security/advisories/new)).
- Incluye:
  - qué componente afecta (protocolo, núcleo, API, interfaz, infraestructura o verificador);
  - cómo reproducirlo;
  - qué propiedad rompe (secreto, unicidad, integridad, verificabilidad o disponibilidad).

### Qué puedes esperar

| Paso | Plazo orientativo |
|---|---|
| Acuse de recibo | 7 días naturales |
| Primera valoración | 21 días naturales |
| Corrección o mitigación publicada | Según la gravedad; antes de la siguiente votación real si afecta al secreto o a la integridad |

El proyecto lo mantienen estudiantes voluntarios: los plazos son orientativos. Publicaremos un aviso de seguridad con crédito a quien informe, salvo que prefiera el anonimato.

### Alcance

- **Dentro del alcance:**
  - el código de este repositorio;
  - la especificación (`spec/`);
  - la documentación del protocolo y del modelo de amenazas;
  - la configuración de despliegue de `infra/`.
- **Fuera del alcance:**
  - los límites ya documentados en el [modelo de amenazas](docs/es/modelo-amenazas.md), salvo que muestres que su impacto es mayor del descrito;
  - los ataques de denegación de servicio de volumen;
  - la ingeniería social contra miembros del órgano;
  - los servicios de terceros (GitHub, proveedor de la VM, Google, drand).

### Puerto seguro

No emprenderemos acciones contra investigaciones de buena fe que respeten esta política, no accedan a datos personales ajenos ni interfieran en una votación real.

## English

### Status

The project is in the **planning phase**: there is no code and no production instance yet. Reports about **design** flaws in the protocol or the threat model are welcome.

### How to report a vulnerability

- **Do not open a public issue.**
- Use **GitHub private vulnerability reporting**: **Security → Report a vulnerability** tab of this repository ([direct link](../../security/advisories/new)).
- Include:
  - the affected component (protocol, core, API, web, infrastructure or verifier);
  - steps to reproduce;
  - which property it breaks (secrecy, uniqueness, integrity, verifiability or availability).

### What to expect

| Step | Indicative time |
|---|---|
| Acknowledgement | 7 calendar days |
| First assessment | 21 calendar days |
| Fix or mitigation published | Depends on severity; before the next real vote if secrecy or integrity is affected |

This project is maintained by student volunteers, so timings are indicative. We will publish a security advisory crediting the reporter unless they prefer to remain anonymous.

### Scope

- **In scope:**
  - the code in this repository;
  - the specification (`spec/`);
  - the protocol and threat model documentation;
  - the deployment configuration in `infra/`.
- **Out of scope:**
  - limits already documented in the [threat model](docs/en/threat-model.md), unless you show a larger impact than described;
  - volumetric denial of service;
  - social engineering against members of the body;
  - third-party services (GitHub, the VM provider, Google, drand).

### Safe harbour

We will not take action against good-faith research that follows this policy, does not access other people's personal data and does not interfere with a real vote.
