import { testPushLoad } from './pushService.ts';

async function main() {
  console.log('Iniciando prueba de carga simulada Web Push (3.000 notificaciones)...');
  const report = await testPushLoad({
    totalObjetivos: 3000,
    chunkSize: 35,
    chunkDelayMs: 75,
  });

  if (!report.estabilidad.todasTareasFinalizadasSinExcepciones) {
    console.error('Prueba de carga fallida: quedaron tareas sin finalizar o hubo excepciones.');
    process.exit(1);
  }

  console.log('Prueba de carga simulada completada exitosamente.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error ejecutando testPushLoad CLI:', err);
  process.exit(1);
});
