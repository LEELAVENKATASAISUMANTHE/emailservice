import { Client } from 'minio';

const bucketName = process.env.MINIO_BUCKET || 'email-bodies';

const minioUrl = new URL(process.env.MINIO_ENDPOINT || 'http://minio:9000');

const minioClient = new Client({
  endPoint: minioUrl.hostname,
  port: Number(minioUrl.port) || 9000,
  useSSL: minioUrl.protocol === 'https:',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
});

export async function ensureBucket() {
  const exists = await minioClient.bucketExists(bucketName);
  if (!exists) {
    await minioClient.makeBucket(bucketName, 'us-east-1');
    console.log(`[minio] Bucket "${bucketName}" created`);
  } else {
    console.log(`[minio] Bucket "${bucketName}" already exists`);
  }
}

export async function saveJobEmailBody(jobId, emailBody) {
  try {
    const objectName = `emails/${jobId}/email-body.txt`;

    const buffer = Buffer.from(emailBody, 'utf-8');

    await minioClient.putObject(
      bucketName,
      objectName,
      buffer,
      buffer.length,
      {
        'Content-Type': 'text/plain',
      }
    );

    console.log(`Saved email body for Job ${jobId}`);

    return {
      bucket: bucketName,
      path: objectName,
    };

  } catch (error) {
    console.error('Error uploading email body:', error);
    throw error;
  }
}

export async function uploadAttachment(jobId, file) {
  try {
    const objectName = `emails/${jobId}/attachments/${file.originalname}`;

    await minioClient.putObject(
      bucketName,
      objectName,
      file.buffer,
      file.size,
      {
        'Content-Type': file.mimetype,
      }
    );

    console.log(`📎 Uploaded attachment: ${file.originalname} for Job ${jobId}`);

    return {
      bucket: bucketName,
      path: objectName,
      filename: file.originalname,
      contentType: file.mimetype,
      size: file.size,
    };

  } catch (error) {
    console.error(`Error uploading attachment ${file.originalname}:`, error);
    throw error;
  }
}

export async function uploadExcelErrorWorkbook(jobId, buffer) {
  try {
    await ensureBucket();

    const objectName = `excel/jobs/${jobId}/error-report.xlsx`;

    await minioClient.putObject(
      bucketName,
      objectName,
      buffer,
      buffer.length,
      {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }
    );

    return {
      bucket: bucketName,
      path: objectName,
      url: `/api/excel/jobs/${jobId}/error-file`,
    };
  } catch (error) {
    console.error(`Error uploading Excel error workbook for job ${jobId}:`, error);
    throw error;
  }
}

export async function getObjectStream(objectName) {
  await ensureBucket();
  return minioClient.getObject(bucketName, objectName);
}

export async function removeObjectIfExists(objectName) {
  if (!objectName) {
    return;
  }

  try {
    await ensureBucket();
    await minioClient.removeObject(bucketName, objectName);
  } catch (error) {
    const notFound =
      error?.code === "NoSuchKey" || error?.message?.includes("Not Found");

    if (!notFound) {
      throw error;
    }
  }
}
