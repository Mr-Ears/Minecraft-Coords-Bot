const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, StringSelectMenuBuilder } = require("discord.js");
const sqlite3 = require("sqlite3").verbose();
require("dotenv").config();

// ---------------- CONFIG ----------------
const SUBMISSION_CHANNEL_ID = "1409262619159953440";
const SORTED_LIST_CHANNEL_ID = "1409265088988315749";
const BOT_TOKEN = process.env.BOT_TOKEN;

// ---------------- DATABASE ----------------
const db = new sqlite3.Database("./coords.db");
db.run(`CREATE TABLE IF NOT EXISTS coords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    x INTEGER,
    y INTEGER,
    z INTEGER,
    dimension TEXT,
    added_by TEXT,
    timestamp TEXT
)`);

// ---------------- CLIENT ----------------
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
});

// ---------------- BOT READY ----------------
client.once("ready", async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);

    // Send the submission message if not already present
    const channel = await client.channels.fetch("1409262619159953440");
    const messages = await channel.messages.fetch({ limit: 10 });
    const botMessage = messages.find(msg => msg.author.id === client.user.id);

    if (!botMessage) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("add_coord")
                .setLabel("➕ Add Coordinate")
                .setStyle(ButtonStyle.Primary)
        );

        await channel.send({
            content: "📝 **Submit a New Coordinate**\nClick the button below to add a new location:",
            components: [row],
        });
    }
});

// ---------------- BUTTON HANDLER ----------------
client.on("interactionCreate", async (interaction) => {
    // Handle button click → show modal
    if (interaction.isButton() && interaction.customId === "add_coord") {
        const modal = new ModalBuilder()
            .setCustomId("coord_modal")
            .setTitle("Add a Coordinate");

        // Inputs for the modal
        const nameInput = new TextInputBuilder()
            .setCustomId("name")
            .setLabel("Place Name")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const xInput = new TextInputBuilder()
            .setCustomId("x")
            .setLabel("X Coordinate")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const yInput = new TextInputBuilder()
            .setCustomId("y")
            .setLabel("Y Coordinate")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const zInput = new TextInputBuilder()
            .setCustomId("z")
            .setLabel("Z Coordinate")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        const dimensionInput = new TextInputBuilder()
            .setCustomId("dimension")
            .setLabel("Dimension (Overworld/Nether/End)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(xInput),
            new ActionRowBuilder().addComponents(yInput),
            new ActionRowBuilder().addComponents(zInput),
            new ActionRowBuilder().addComponents(dimensionInput)
        );

        return interaction.showModal(modal);
    }

    // Handle modal submission → save to DB
    if (interaction.isModalSubmit() && interaction.customId === "coord_modal") {
        const name = interaction.fields.getTextInputValue("name").trim();
        const x = parseInt(interaction.fields.getTextInputValue("x"));
        const y = parseInt(interaction.fields.getTextInputValue("y"));
        const z = parseInt(interaction.fields.getTextInputValue("z"));
        const dimension = interaction.fields.getTextInputValue("dimension").trim();

        if (isNaN(x) || isNaN(y) || isNaN(z)) {
            return interaction.reply({ content: "❌ Invalid coordinates. Please enter numbers only.", ephemeral: true });
        }

        const validDimensions = ["overworld", "nether", "end"];
        if (!validDimensions.includes(dimension.toLowerCase())) {
            return interaction.reply({ content: "❌ Invalid dimension. Use Overworld, Nether, or End.", ephemeral: true });
        }

        db.run(
            `INSERT INTO coords (name, x, y, z, dimension, added_by, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [name, x, y, z, dimension, interaction.user.username, new Date().toISOString()],
            async function (err) {
                if (err) {
                    console.error(err);
                    return interaction.reply({ content: "❌ Failed to save coordinate.", ephemeral: true });
                }

                await updateSortedList(interaction.guild);
                return interaction.reply({ content: `✅ Saved **${name}** → (${x}, ${y}, ${z}) in **${dimension}**!`, ephemeral: true });

            }
        );
    }
});

// ---------------- UPDATE SORTED LIST ----------------
async function updateSortedList(guild) {
    const channel = await guild.channels.fetch("1409265088988315749");

    db.all(`SELECT * FROM coords ORDER BY dimension, name`, [], async (err, rows) => {
        if (err) return console.error(err);

        // Group coordinates by dimension, then by name
        const grouped = {};
        for (const row of rows) {
            const dim = row.dimension.toLowerCase();

            if (!grouped[dim]) grouped[dim] = {};
            if (!grouped[dim][row.name]) grouped[dim][row.name] = [];

            // Push each coordinate under the same name
            grouped[dim][row.name].push({
                x: row.x,
                y: row.y,
                z: row.z,
                added_by: row.added_by,
                timestamp: row.timestamp
            });
        }


        const dimensions = {
            overworld: "🌍 **Overworld**",
            nether: "🔥 **Nether**",
            end: "🌌 **End**"
        };
        
        let description = "📌 **Minecraft Coordinates Index**\n\n";
        
        for (const dim of Object.keys(dimensions)) {
            if (!grouped[dim]) continue;
        
            // Add the dimension header
            description += `${dimensions[dim]}\n`;
        
            // Sort names alphabetically within each dimension
            const sortedNames = Object.keys(grouped[dim]).sort((a, b) => a.localeCompare(b));
        
            for (const name of sortedNames) {
                description += ` • **${name}**\n`;
        
                // List all coordinates for this name
                grouped[dim][name].forEach((row, index) => {
                    description += `    - X: ${row.x}, Y: ${row.y}, Z: ${row.z} *(Added by ${row.added_by})*\n`;
                });
            }
        
            description += "\n";
        }
        

        description += `🕒 Last updated: <t:${Math.floor(Date.now() / 1000)}:f>`;

const fs = require("fs");
const configPath = "./config.json";
let config = JSON.parse(fs.readFileSync(configPath, "utf8"));

// Try to fetch the stored message
let botMessage;
if (config.sortedMessageId) {
    try {
        botMessage = await channel.messages.fetch(config.sortedMessageId);
    } catch {
        botMessage = null; // message might have been deleted
    }
}

const embed = new EmbedBuilder()
    .setDescription(description)
    .setColor(0x00AE86);

if (botMessage) {
    // Edit the existing embed
    await botMessage.edit({ embeds: [embed] });
} else {
    // Send a new one and store its ID
    botMessage = await channel.send({ embeds: [embed] });
    config.sortedMessageId = botMessage.id;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

    });
}

// ---------------- LOGIN ----------------
client.login(process.env.TOKEN);

