# SST · Cumplimiento de requisitos — prototipo

Prototipo del caso técnico de Buk: modelar y calcular el cumplimiento de requisitos
de Seguridad y Salud en el Trabajo por colaborador, para poder responder ante una
fiscalización.

Responde las tres preguntas del enunciado:

1. **¿Qué requisitos cumple cada empleado hoy?** → tablero y detalle por empleado.
2. **¿Qué requisitos no cumple?** → mismo lugar, distinguiendo *no cumple* de
   *evidencia en revisión*.
3. **¿Hubo períodos sin cumplimiento?** → `Incumplimientos`, con el tramo exacto de
   días y el motivo, aunque hoy el empleado esté al día.

## Puesta en marcha

```bash
npm install
cp .env.example .env      # pega la URL y la anon key de tu proyecto Supabase
npm run dev
```
