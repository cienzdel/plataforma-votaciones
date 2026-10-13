# ADR-0008: Consistencia de la clave pública

- Estado: Propuesto
- Fecha: 2026-10-13

## Contexto

Si el servidor entrega una clave pública distinta a cada persona, puede reconocer después qué clave firmó cada voto y romper el anonimato («ataque de etiquetado»).

## Decisión

- El cliente siempre compara la huella `H(SPKI)` de la clave que recibe con una referencia y rechaza la votación si no coinciden.
- **Enlace final:** la referencia es la huella publicada en el repositorio de datos, servida por GitHub Pages. La votación no se abre hasta que la huella es visible allí.
- **En directo:** la referencia es el tablón de la API, salvo que la mesa decida esperar a que se publique la huella en Pages (~1 min [por verificar]).
- No hay comprobación humana de la huella en la sala.

## Alternativas descartadas

- **Proyectar la huella en la sala y comprobarla a ojo:** se descartó por simplicidad.
- **No usar ninguna referencia externa:** dejaría el ataque abierto en todos los casos.

## Consecuencias

- En el enlace final, el ataque exige que GitHub colabore.
- En directo sin espera, **una VM maliciosa que sirva clave y tablón distintos a cada persona podría etiquetar votos**. Es una vulnerabilidad conocida y documentada.
