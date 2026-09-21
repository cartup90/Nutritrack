import nodemailer from 'nodemailer';

/**
 * Envío de correo.
 *
 * Si no hay SMTP configurado, el enlace de restablecimiento se escribe en el
 * registro del servidor en lugar de fallar. Es el patrón habitual en software
 * autoalojado: quien administra el servidor puede leerlo y pasárselo al
 * usuario. Así la función sirve desde el primer día, sin obligar a contratar
 * un proveedor de correo.
 */

let transporte = null;

/** ¿Hay configuración de SMTP suficiente para enviar? */
export const emailConfigurado = () =>
  Boolean(process.env.EMAIL_HOST && process.env.EMAIL_USER);

const getTransporte = () => {
  if (transporte) return transporte;

  transporte = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT || 587),
    secure: Number(process.env.EMAIL_PORT) === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  return transporte;
};

/**
 * Envía el enlace de restablecimiento.
 * @returns {Promise<{enviado: boolean, motivo?: string}>}
 */
export const enviarEmailReset = async ({ to, nombre, resetUrl, validezMinutos }) => {
  const asunto = 'Restablece tu contraseña de NutriTrack';

  const texto = `Hola ${nombre || ''},

Alguien solicitó restablecer la contraseña de tu cuenta en NutriTrack.

Abre este enlace para elegir una nueva:
${resetUrl}

El enlace caduca en ${validezMinutos} minutos y solo puede usarse una vez.

Si no fuiste tú, ignora este mensaje: tu contraseña no ha cambiado.
`;

  // --- Sin SMTP: se deja constancia en el registro del servidor ------------
  if (!emailConfigurado()) {
    console.log('\n' + '='.repeat(70));
    console.log('  RESTABLECIMIENTO DE CONTRASEÑA (SMTP no configurado)');
    console.log('='.repeat(70));
    console.log(`  Para: ${to}`);
    console.log(`  Enlace: ${resetUrl}`);
    console.log(`  Caduca en ${validezMinutos} minutos.`);
    console.log('');
    console.log('  Copia ese enlace en el navegador para elegir una contraseña nueva.');
    console.log('  Para enviarlo por correo, configura EMAIL_HOST, EMAIL_USER y');
    console.log('  EMAIL_PASS en el archivo .env');
    console.log('='.repeat(70) + '\n');

    return { enviado: false, motivo: 'smtp_no_configurado' };
  }

  try {
    await getTransporte().sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to,
      subject: asunto,
      text: texto,
    });

    return { enviado: true };
  } catch (error) {
    console.error('[email] No se pudo enviar el correo:', error.message);

    // Aun fallando el envío, se deja el enlace accesible para quien administra
    console.log(`[email] Enlace de restablecimiento para ${to}: ${resetUrl}`);

    return { enviado: false, motivo: 'error_envio' };
  }
};
