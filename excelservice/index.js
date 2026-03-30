import express from 'express';
import { pool, connectToDB, pingDB, fetchtables, fetchtabledata, fetchTableColumns, bulkInsert, fetchJoinedTables } from './db.js';
import { ensureBuckets, uploadTemplate, getPresignedTemplateUrl, uploadLog, getPresignedLogUrl, pingMinio } from './minio.js';

const app = express();
const PORT =3000;

app.use(express.json());

app.get('/health', async (req, res) => {
    const [db, minio] = await Promise.all([pingDB(), pingMinio()]);
    res.json({
        db,
        minio,
        status: db && minio ? 'healthy' : 'degraded',
    });
}); 

app.get('/tables', async (req, res) => {
    try {
        const tables = await fetchtables();
        res.json(tables);
    } catch (error) {
        console.error('Error fetching tables:', error.message);
        res.status(500).json({ error: 'Failed to fetch tables' });
    } 
});

app.get('/tables/:tablename', async (req, res) => {
    try {
        const { tablename } = req.params;
        const data = await fetchtabledata(tablename);
        res.json(data);
    } catch (error) {
        console.error('Error fetching table data:', error.message);
        res.status(500).json({ error: 'Failed to fetch table data' });
    }
});

app.get('/tables/:tablename/columns', async (req, res) => {
    try {
        const { tablename } = req.params;
        const columns = await fetchTableColumns(tablename);
        res.json(columns);
    } catch (error) {
        console.error('Error fetching table columns:', error.message);
        res.status(500).json({ error: 'Failed to fetch table columns' });
    }
});
app.get('/tables/joined', async (req, res) => {
    try {
        const { tables } = req.body;
        const result = await fetchJoinedTables(tables);
        res.json(result);
    } catch (error) {
        console.error('Error fetching joined tables:', error.message);
        res.status(500).json({ error: 'Failed to fetch joined tables' });
    }
}); 

app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`http://localhost:${PORT}`);
    await connectToDB();
    await ensureBuckets();
});

