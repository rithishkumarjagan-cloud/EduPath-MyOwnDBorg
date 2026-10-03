const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const XLSX = require("xlsx");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

const DB_DIR = path.join(__dirname, "database");
const DB = path.join(DB_DIR, "users.json");
const EXPORT_DIR = path.join(__dirname, "exports");
const EXPORT_FILE = path.join(EXPORT_DIR, "EduPath_Users.xlsx");

function getUsers() {
    if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB)) {
        fs.writeFileSync(DB, "[]", "utf8");
    }

    try {
        const data = fs.readFileSync(DB, "utf8");
        return JSON.parse(data || "[]");
    } catch (error) {
        console.error("Database read error:", error);
        return [];
    }
}

function saveUsers(users) {
    if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
    }
    fs.writeFileSync(DB, JSON.stringify(users, null, 2), "utf8");
}

function safeUser(user) {
    return {
        id: user.id,
        name: user.name,
        age: user.age,
        role: user.role,
        preferredCourse: user.preferredCourse,
        createdAt: user.createdAt
    };
}

app.get("/", (req, res) => {
    res.send("MyOwnDB is running successfully!");
});

// Register from EduPath
app.post("/register", async (req, res) => {
    try {
        const { name, age, role, preferredCourse } = req.body;

        if (!name || !age || !role) {
            return res.status(400).json({
                message: "Name, age and role are required."
            });
        }

        const users = getUsers();

        const existingUser = users.find(
            user =>
                user.name.toLowerCase() === String(name).trim().toLowerCase() &&
                Number(user.age) === Number(age) &&
                user.role.toLowerCase() === String(role).trim().toLowerCase()
        );

        if (existingUser) {
            return res.status(409).json({
                message: "This user is already registered. Please login."
            });
        }

        // The current EduPath login uses name + age + role.
        // We still keep a bcrypt hash in the database for future password support.
        const passwordHash = await bcrypt.hash(
            `${name}-${age}-${role}-${Date.now()}`,
            10
        );

        const newUser = {
            id: "USR" + Date.now(),
            name: String(name).trim(),
            age: Number(age),
            role: String(role).trim().toLowerCase(),
            preferredCourse: preferredCourse || null,
            passwordHash,
            createdAt: new Date().toISOString()
        };

        users.push(newUser);
        saveUsers(users);

        res.status(201).json({
            message: "Registration successful",
            user: safeUser(newUser)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error during registration." });
    }
});

// Login from EduPath
app.post("/login", async (req, res) => {
    try {
        const { name, age, role } = req.body;

        if (!name || !age || !role) {
            return res.status(400).json({
                message: "Name, age and role are required."
            });
        }

        const users = getUsers();

        const user = users.find(
            item =>
                item.name.toLowerCase() === String(name).trim().toLowerCase() &&
                Number(item.age) === Number(age) &&
                item.role.toLowerCase() === String(role).trim().toLowerCase()
        );

        if (!user) {
            return res.status(401).json({
                message: "User not found. Please sign up first."
            });
        }

        res.json({
            message: "Login successful",
            user: safeUser(user)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error during login." });
    }
});

// Admin/user list
app.get("/users", (req, res) => {
    const users = getUsers();
    res.json(users.map(safeUser));
});

// Export all users to an Excel workbook
app.get("/export-excel", (req, res) => {
    try {
        const users = getUsers();

        if (!fs.existsSync(EXPORT_DIR)) {
            fs.mkdirSync(EXPORT_DIR, { recursive: true });
        }

        const excelData = users.map((user, index) => ({
            "S.No": index + 1,
            "User ID": user.id,
            "Name": user.name,
            "Age": user.age,
            "Role": user.role,
            "Preferred Course": user.preferredCourse || "-",
            "Registered Date": new Date(user.createdAt).toLocaleString()
        }));

        const worksheet = XLSX.utils.json_to_sheet(excelData);
        worksheet["!cols"] = [
            { wch: 8 },
            { wch: 18 },
            { wch: 22 },
            { wch: 8 },
            { wch: 16 },
            { wch: 28 },
            { wch: 24 }
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Users");
        XLSX.writeFile(workbook, EXPORT_FILE);

        res.download(EXPORT_FILE, "EduPath_Users.xlsx");
    } catch (error) {
        console.error("Excel export error:", error);
        res.status(500).json({ message: "Excel export failed." });
    }
});

// Optional API to get summary statistics for the admin application
app.get("/stats", (req, res) => {
    const users = getUsers();
    const roleCounts = {};
    const courseCounts = {};

    users.forEach(user => {
        const role = user.role || "unknown";
        const course = user.preferredCourse || "Not selected";
        roleCounts[role] = (roleCounts[role] || 0) + 1;
        courseCounts[course] = (courseCounts[course] || 0) + 1;
    });

    res.json({
        totalUsers: users.length,
        roleCounts,
        courseCounts
    });
});

app.listen(PORT, () => {
    console.log(`MyOwnDB server running on http://localhost:${PORT}`);
});
