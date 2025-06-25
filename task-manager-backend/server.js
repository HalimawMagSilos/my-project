// server.js
// Loads environment variables from the .env file into process.env
require('dotenv').config();

// Import necessary modules
const express = require('express');
const mysql = require('mysql2/promise'); // Using the promise-based API for async/await
const cors = require('cors'); // Middleware to handle Cross-Origin Resource Sharing
const crypto = require('crypto'); // Node.js built-in module for cryptographic functions (used for UUID)

// Initialize the Express application
const app = express(); // <--- THIS LINE IS CRUCIAL! It defines 'app'.
// Set the port for the server, defaults to 5000 if not specified in .env
const PORT = process.env.PORT || 5000; // This is the port for the Node.js backend server

// Middleware setup
app.use(cors()); // Enables CORS for all origins, allowing frontend to access this API during development
app.use(express.json()); // Parses incoming requests with JSON payloads

// Create a MySQL database connection pool.
// A pool efficiently manages multiple database connections for concurrent requests.
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true, // If all connections are in use, wait for one to become free
    connectionLimit: 10,      // Maximum number of connections in the pool
    queueLimit: 0             // Maximum number of requests the pool will queue
    // MySQL port (3306) is used by default if not specified here.
    // If your MySQL server runs on a different port, you would add: port: process.env.DB_PORT,
});

// Test the database connection when the server starts
pool.getConnection()
    .then(connection => {
        console.log('MySQL Connected successfully to database:', process.env.DB_NAME);
        connection.release(); // Release the connection back to the pool
    })
    .catch(err => {
        console.error('--- START CRITICAL DB CONNECTION ERROR ---');
        console.error('Failed to connect to MySQL database:', err.message);
        console.error('Please check your .env file credentials and MySQL server status.');
        console.error('Full Error Details:', JSON.stringify(err, null, 2));
        console.error('--- END CRITICAL DB CONNECTION ERROR ---');
        process.exit(1); // Exit the application if database connection fails
    });

// Simple middleware to assign a unique user ID to each request.
// In a real application, this would be part of a robust authentication system (e.g., JWT, sessions).
app.use((req, res, next) => {
    // If an 'x-user-id' header is provided by the frontend, use it. Otherwise, generate a random UUID.
    req.userId = req.headers['x-user-id'] || crypto.randomUUID();
    next(); // Pass control to the next middleware/route handler
});

// --- API Endpoints for Tasks (CRUD Operations) ---

// READ: Get all tasks for a specific user
app.get('/api/tasks', async (req, res) => {
    const userId = req.query.userId || req.userId;

    if (!userId) {
        return res.status(400).json({ message: 'User ID is required to fetch tasks.' });
    }

    try {
        console.log(`[GET /api/tasks] Attempting to fetch tasks for userId: ${userId}`);
        const [rows] = await pool.execute(
            'SELECT id, text, completed, user_id AS userId, create_at AS createdAt FROM task_tb WHERE user_id = ? ORDER BY create_at ASC',
            [userId]
        );
        console.log(`[GET /api/tasks] Fetched ${rows.length} tasks for userId: ${userId}`);
        res.json(rows); // Send the fetched tasks as a JSON array
    } catch (err) {
        console.error('--- START ERROR: FETCHING TASKS ---');
        console.error('Error fetching tasks:', err.message);
        console.error('SQL Query:', 'SELECT id, text, completed, user_id AS userId, create_at AS createdAt FROM task_tb WHERE user_id = ? ORDER BY create_at ASC');
        console.error('Parameters:', [userId]);
        console.error('SQL Query Error Details:', err.sqlMessage); // MySQL specific error message
        console.error('Error Code:', err.code); // MySQL specific error code (e.g., 'ER_NO_SUCH_TABLE')
        console.error('Full Error Object:', JSON.stringify(err, null, 2));
        console.trace('Error Stack Trace (Fetch Tasks):'); // Detailed stack trace
        console.error('--- END ERROR: FETCHING TASKS ---');
        res.status(500).json({ message: 'Failed to fetch tasks', error: err.message });
    }
});

// CREATE: Add a new task
app.post('/api/tasks', async (req, res) => {
    // Destructure text from the request body. Get userId from body or middleware.
    const { text } = req.body;
    const userId = req.body.userId || req.userId;

    // Basic input validation
    if (!text || text.trim() === '') {
        return res.status(400).json({ message: 'Task text cannot be empty.' });
    }
    if (!userId) {
        return res.status(400).json({ message: 'User ID is required to add tasks.' });
    }

    const createdAt = Date.now(); // Get current timestamp in milliseconds

    try {
        console.log(`[POST /api/tasks] Attempting to add task: "${text}" for userId: ${userId}`);
        const [result] = await pool.execute(
            'INSERT INTO task_tb (text, completed, user_id, create_at) VALUES (?, ?, ?, ?)',
            [text, false, userId, createdAt]
        );
        console.log(`[POST /api/tasks] Task added with ID: ${result.insertId}`);
        res.status(201).json({ id: result.insertId, text, completed: false, userId, createdAt });
    } catch (err) {
        console.error('--- START ERROR: ADDING TASK ---');
        console.error('Error adding task:', err.message);
        console.error('SQL Query:', 'INSERT INTO task_tb (text, completed, user_id, create_at) VALUES (?, ?, ?, ?)');
        console.error('Parameters:', [text, false, userId, createdAt]);
        console.error('SQL Query Error Details:', err.sqlMessage);
        console.error('Error Code:', err.code);
        console.error('Full Error Object:', JSON.stringify(err, null, 2));
        console.trace('Error Stack Trace (Add Task):');
        console.error('--- END ERROR: ADDING TASK ---');
        res.status(500).json({ message: 'Failed to add task', error: err.message });
    }
});

// UPDATE: Update a task's completion status
app.put('/api/tasks/:id', async (req, res) => {
    const taskId = req.params.id; // Get task ID from URL parameters
    const { completed, userId } = req.body; // Get new completion status and userId from request body

    // Validate input and user ID
    if (typeof completed !== 'boolean') {
        return res.status(400).json({ message: 'Invalid "completed" status.' });
    }
    if (!userId) {
        return res.status(400).json({ message: 'User ID is required for updating tasks.' });
    }

    try {
        console.log(`[PUT /api/tasks/${taskId}] Attempting to update task for userId: ${userId}, completed: ${completed}`);
        const [result] = await pool.execute(
            'UPDATE task_tb SET completed = ? WHERE id = ? AND user_id = ?',
            [completed, taskId, userId]
        );

        if (result.affectedRows === 0) {
            console.warn(`[PUT /api/tasks/${taskId}] Task not found or does not belong to user: ${userId}`);
            return res.status(404).json({ message: 'Task not found or does not belong to this user.' });
        }
        console.log(`[PUT /api/tasks/${taskId}] Task updated successfully.`);
        res.json({ message: 'Task updated successfully', id: taskId, completed });
    } catch (err) {
        console.error('--- START ERROR: UPDATING TASK ---');
        console.error('Error updating task:', err.message);
        console.error('SQL Query:', 'UPDATE task_tb SET completed = ? WHERE id = ? AND user_id = ?');
        console.error('Parameters:', [completed, taskId, userId]);
        console.error('SQL Query Error Details:', err.sqlMessage);
        console.error('Error Code:', err.code);
        console.error('Full Error Object:', JSON.stringify(err, null, 2));
        console.trace('Error Stack Trace (Update Task):');
        console.error('--- END ERROR: UPDATING TASK ---');
        res.status(500).json({ message: 'Failed to update task', error: err.message });
    }
});

// DELETE: Delete a task
app.delete('/api/tasks/:id', async (req, res) => {
    const taskId = req.params.id; // Get task ID from URL parameters
    const { userId } = req.body; // Get userId from request body for verification

    if (!userId) {
        return res.status(400).json({ message: 'User ID is required for deleting tasks.' });
    }

    try {
        console.log(`[DELETE /api/tasks/${taskId}] Attempting to delete task for userId: ${userId}`);
        const [result] = await pool.execute(
            'DELETE FROM task_tb WHERE id = ? AND user_id = ?',
            [taskId, userId]
        );

        if (result.affectedRows === 0) {
            console.warn(`[DELETE /api/tasks/${taskId}] Task not found or does not belong to user: ${userId}`);
            return res.status(404).json({ message: 'Task not found or does not belong to this user.' });
        }
        console.log(`[DELETE /api/tasks/${taskId}] Task deleted successfully.`);
        res.json({ message: 'Task deleted successfully', id: taskId });
    } catch (err) {
        console.error('--- START ERROR: DELETING TASK ---');
        console.error('Error deleting task:', err.message);
        console.error('SQL Query:', 'DELETE FROM task_tb WHERE id = ? AND user_id = ?');
        console.error('Parameters:', [taskId, userId]);
        console.error('SQL Query Error Details:', err.sqlMessage);
        console.error('Error Code:', err.code);
        console.error('Full Error Object:', JSON.stringify(err, null, 2));
        console.trace('Error Stack Trace (Delete Task):');
        console.error('--- END ERROR: DELETING TASK ---');
        res.status(500).json({ message: 'Failed to delete task', error: err.message });
    }
});

// Start the Express server
app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
    console.log('Ensure your MySQL server is running and .env file is configured correctly.');
});
