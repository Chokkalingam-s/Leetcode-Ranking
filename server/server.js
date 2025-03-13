const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { Sequelize, DataTypes } = require("sequelize");

const app = express();
const PORT = 3000;

// Setup Sequelize with MySQL
const sequelize = new Sequelize("leetcode_ranking", "root", "mysql", {
    host: "localhost",
    dialect: "mysql",
    logging: false, // Disable logging
});

// Define Student Model
const Student = sequelize.define("Student", {
    regNo: { type: DataTypes.STRING, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    department: { type: DataTypes.STRING, allowNull: false },
    year: { type: DataTypes.STRING, allowNull: false },
    leetcodeUrl: { type: DataTypes.STRING, allowNull: false },
    totalSolved: { type: DataTypes.INTEGER, defaultValue: 0 },
});

// Sync Database
sequelize.sync().then(() => console.log("✅ Database Synced"));

// Middleware
app.use(cors());
app.use(express.json());

// Function to extract username from LeetCode URL
const extractUsername = (url) => url.replace(/\/+$/, "").split("/").pop();

// Function to fetch LeetCode problem count
const fetchLeetCodeStats = async (username) => {
    try {
        const response = await axios.post("https://leetcode.com/graphql", {
            query: `
                query getUserProfile($username: String!) {
                    matchedUser(username: $username) {
                        submitStatsGlobal {
                            acSubmissionNum {
                                count
                            }
                        }
                    }
                }
            `,
            variables: { username },
        }, { headers: { "Content-Type": "application/json" } });

        const userData = response.data.data.matchedUser;
        if (!userData) return null;

        return userData.submitStatsGlobal.acSubmissionNum[0].count;
    } catch (error) {
        console.error(`❌ Error fetching LeetCode data for ${username}:`, error.message);
        return null;
    }
};

// API to Add Student
app.post("/add-student", async (req, res) => {
    const { regNo, name, department, year, leetcodeUrl } = req.body;
    const username = extractUsername(leetcodeUrl);

    try {
        const totalSolved = await fetchLeetCodeStats(username);
        if (totalSolved === null) return res.status(400).json({ error: "Invalid LeetCode profile" });

        const student = await Student.create({ regNo, name, department, year, leetcodeUrl, totalSolved });
        res.json({ message: "✅ Student added successfully", student });
    } catch (error) {
        res.status(500).json({ error: "⚠️ Failed to add student" });
    }
});

// API to Get All Students (Sorted by Problem Solved)
app.get("/students", async (req, res) => {
    const students = await Student.findAll({ order: [["totalSolved", "DESC"]] });
    res.json(students);
});

// Function to update LeetCode counts at 12 AM, 8 AM, 8 PM
const scheduleUpdates = () => {
    const updateTimes = ["00:00", "08:00", "20:00"];

    updateTimes.forEach((time) => {
        const [hours, minutes] = time.split(":").map(Number);
        const now = new Date();
        const nextUpdate = new Date();

        nextUpdate.setHours(hours, minutes, 0, 0);
        if (nextUpdate < now) nextUpdate.setDate(nextUpdate.getDate() + 1);

        const delay = nextUpdate - now;
        setTimeout(() => {
            updateLeetCodeCounts();
            setInterval(updateLeetCodeCounts, 8 * 60 * 60 * 1000); // Repeat every 8 hours
        }, delay);

        console.log(`⏳ Next update scheduled at ${nextUpdate.toLocaleString()}`);
    });
};

// Function to update LeetCode problem counts
const updateLeetCodeCounts = async () => {
    console.log("🔄 Updating LeetCode stats...");

    const students = await Student.findAll();
    let updated = false;

    for (let student of students) {
        const username = extractUsername(student.leetcodeUrl);
        const newCount = await fetchLeetCodeStats(username);

        if (newCount !== null && newCount !== student.totalSolved) {
            console.log(`🔄 Updating ${student.name}: ${student.totalSolved} → ${newCount}`);
            student.totalSolved = newCount;
            await student.save();
            updated = true;
        }
    }

    console.log(updated ? "✅ Update complete!" : "ℹ️ No changes detected.");
};

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    scheduleUpdates(); // Start scheduled updates
});
