const express = require("express");
const fs = require("fs");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = 3000;
const DATA_FILE = "data.json";

app.use(cors());
app.use(express.json());

// GraphQL query to fetch LeetCode problem count
const graphqlQuery = (username) => ({
    query: `
        query getUserProfile($username: String!) {
            matchedUser(username: $username) {
                username
                submitStatsGlobal {
                    acSubmissionNum {
                        count
                    }
                }
            }
        }
    `,
    variables: { username },
});

// Function to read stored student data
const readData = () => {
    if (!fs.existsSync(DATA_FILE)) return [];
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
};

// Function to write updated student data
const writeData = (data) => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
};

// Function to fetch LeetCode problem count (With Debugging)
const fetchLeetCodeStats = async (username) => {
    try {
        const response = await axios.post(
            `https://leetcode.com/graphql?t=${Date.now()}`, // Bypass cache
            graphqlQuery(username),
            { headers: { "Content-Type": "application/json" } }
        );

        const userData = response.data.data.matchedUser;

        // Debug: Log the full response
        console.log(`📢 API Response for ${username}:`, JSON.stringify(userData, null, 2));

        if (!userData) return null;

        return userData.submitStatsGlobal.acSubmissionNum[0].count;
    } catch (error) {
        console.error(`❌ Error fetching LeetCode data for ${username}:`, error.message);
        return null;
    }
};
app.post("/add-student", async (req, res) => {
    const { regNo, name, department, year, leetcodeUrl } = req.body;
    const username = leetcodeUrl.split("/u/")[1].replace("/", "");

    try {
        // Fetch LeetCode stats
        const response = await axios.post("https://leetcode.com/graphql", graphqlQuery(username), {
            headers: { "Content-Type": "application/json" },
        });

        const userData = response.data.data.matchedUser;
        if (!userData) return res.status(404).json({ error: "Invalid LeetCode profile" });

        const totalSolved = userData.submitStatsGlobal.acSubmissionNum[0].count;

        const students = readData();
        students.push({ regNo, name, department, year, leetcodeUrl, totalSolved });
        writeData(students);

        res.json({ message: "Student added successfully", totalSolved });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch LeetCode data" });
    }
});
// Function to update LeetCode problem counts
const updateLeetCodeCounts = async () => {
    let students = readData();
    let updated = false;

    for (let student of students) {
        const extractUsername = (url) => {
            return url.replace(/\/+$/, "").split("/").pop(); // Extracts last part of the URL correctly
        };
        
        // Inside the updateLeetCodeCounts function:
        const username = extractUsername(student.leetcodeUrl);
        
        const newCount = await fetchLeetCodeStats(username);

        if (newCount !== null) {
            console.log(`🔍 Checking ${student.name}: Stored=${student.totalSolved}, New=${newCount}`);
        }

        if (newCount !== null && newCount !== student.totalSolved) {
            console.log(`🔄 Updating ${student.name} from ${student.totalSolved} → ${newCount}`);
            student.totalSolved = newCount;
            updated = true;
        }
    }

    if (updated) {
        console.log("✅ Writing new data to data.json...");
        writeData(students);
        console.log("✅ LeetCode problem counts updated!");
    } else {
        console.log("ℹ️ No changes detected in LeetCode problem counts.");
    }
};

// API: Get students (Forces update before sending data)
app.get("/students", async (req, res) => {
    await updateLeetCodeCounts(); // Ensure latest data
    const students = readData().sort((a, b) => b.totalSolved - a.totalSolved);
    res.json(students);
});

// Run background update every 15 seconds
setInterval(updateLeetCodeCounts, 15000);

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    updateLeetCodeCounts(); // Initial update on startup
});
