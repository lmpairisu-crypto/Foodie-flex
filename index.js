const express = require("express");
const OpenAI = require("openai");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionsBitField
} = require("discord.js");

// ==================================================
// CONFIG
// ==================================================

const PORT = process.env.PORT || 10000;

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Food channel
const FOOD_CHANNEL_ID = "1550189625954402314";

// Exact trigger
const TRIGGER = "kain po tayo team ryzza";

// AI model
const AI_MODEL = "gpt-5.6-luna";

// Target checking time.
// This is a timeout, not a guaranteed response time.
const AI_TIMEOUT_MS = 1000;

// ==================================================
// ENVIRONMENT VARIABLES
// ==================================================

if (!DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing.");
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY is missing.");
  process.exit(1);
}

// ==================================================
// OPENAI
// ==================================================

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

// ==================================================
// FOOD EMOJIS
// ==================================================

const FOOD_EMOJIS = [
  "🍞", "🥖", "🥐", "🍳", "🥚", "🧀", "🥨", "🫓",
  "🧈", "🥓", "🥩", "🥞", "🧇", "🍤", "🍗", "🍖",
  "🦴", "🍕", "🌭", "🍟", "🥙", "🧆", "🌮", "🌯",
  "🫔", "🥘", "🍝", "🍜", "🍲", "🍥", "🥯", "🥮",
  "🍣", "🍱", "🍛", "🍚", "🍘", "🥧", "🍦", "🍨",
  "🍧", "🍡", "🍢", "🥠", "🧁", "🍰", "🎂", "🍮",
  "🍭", "🍬", "🍫", "🥛", "🍯", "🍪", "🦪", "🥟",
  "🍩", "🍿", "☕", "🍵", "🧋", "🥤", "🧃"
];

function getFoodEmoji() {
  return FOOD_EMOJIS[
    Math.floor(Math.random() * FOOD_EMOJIS.length)
  ];
}

// ==================================================
// EXPRESS HEALTH SERVER
// ==================================================

const app = express();

app.get("/", (req, res) => {
  res.send("Kain Po Tayo Team Ryzza Bot is online!");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Health server running on port ${PORT}`);
});

// ==================================================
// DISCORD CLIENT
// ==================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ==================================================
// HELPERS
// ==================================================

function hasExactTrigger(content) {
  return content.trim().toLowerCase() === TRIGGER;
}

function isImage(attachment) {
  return attachment.contentType?.startsWith("image/");
}

async function safeDelete(message) {
  try {
    if (message?.deletable) {
      await message.delete();
    }
  } catch (error) {
    console.log("Delete skipped:", error.message);
  }
}

// ==================================================
// DOWNLOAD IMAGE BEFORE DELETING ORIGINAL
// ==================================================

async function downloadAttachment(attachment) {
  try {
    const response = await fetch(attachment.url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();

    return {
      attachment: Buffer.from(arrayBuffer),
      name: attachment.name || "food-image"
    };
  } catch (error) {
    console.error(
      `Download failed for ${attachment.name || "attachment"}:`,
      error.message
    );

    return null;
  }
}

// ==================================================
// AI FOOD CHECK
// ==================================================

async function checkIfFood(imageUrl) {
  const aiRequest = openai.responses.create({
    model: AI_MODEL,

    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `
Look carefully at this image.

Reply with ONLY:
FOOD
or
NOT_FOOD

IMPORTANT:
- Reply FOOD if ANY clearly visible food or drink is present anywhere in the image.
- A person being in the picture does NOT make it NOT_FOOD.
- A person holding, eating, preparing, serving, or standing near food still counts as FOOD.
- Food does not need to be the main subject.
- Drinks also count as FOOD.
- Multiple people are okay.
- Background objects are okay.
- Only reply NOT_FOOD when there is no clearly visible food or drink anywhere in the image.
`
          },
          {
            type: "input_image",
            image_url: imageUrl
          }
        ]
      }
    ],

    max_output_tokens: 10
  });

  const timeout = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error("AI check timeout"));
    }, AI_TIMEOUT_MS);
  });

  try {
    const response = await Promise.race([
      aiRequest,
      timeout
    ]);

    const result = response.output_text
      ?.trim()
      .toUpperCase();

    console.log(`AI result: ${result}`);

    return result === "FOOD";
  } catch (error) {
    console.log(
      "AI check failed/timeout:",
      error.message
    );

    // If AI cannot verify the image,
    // don't automatically publish it.
    return false;
  }
}

// ==================================================
// PRIVATE DM
// ==================================================

async function sendPrivateMessage(user, text) {
  try {
    await user.send(text);
  } catch (error) {
    console.log(
      `Could not DM ${user.tag}:`,
      error.message
    );
  }
}

// ==================================================
// DUPLICATE-SAFE REMINDER
// ==================================================

async function ensureReminder(channel) {
  try {
    const recentMessages =
      await channel.messages.fetch({
        limit: 100
      });

    const existingReminder =
      recentMessages.find(message =>
        message.author.id === client.user.id &&
        message.embeds.some(
          embed =>
            embed.title === "🍽️ Foodie Reminder"
        )
      );

    if (existingReminder) {
      if (!existingReminder.pinned) {
        try {
          await existingReminder.pin();
        } catch (error) {
          console.log(
            "Could not pin existing reminder:",
            error.message
          );
        }
      }

      console.log(
        "✅ Existing Foodie Reminder found. No duplicate created."
      );

      return;
    }

    const reminder = new EmbedBuilder()
      .setTitle("🍽️ Foodie Reminder")
      .setDescription(
        "Post your food here with **Kain Po Tayo Team Ryzza** + a picture."
      );

    const reminderMessage =
      await channel.send({
        embeds: [reminder]
      });

    await reminderMessage.pin();

    console.log(
      "📌 Foodie Reminder created and pinned."
    );
  } catch (error) {
    console.error(
      "Reminder error:",
      error.message
    );
  }
}

// ==================================================
// BOT READY
// ==================================================

client.once("ready", async () => {
  console.log("====================================");
  console.log(
    `🤖 Logged in as ${client.user.tag}`
  );
  console.log(
    `📢 Food channel: ${FOOD_CHANNEL_ID}`
  );
  console.log(`🔑 Trigger: ${TRIGGER}`);
  console.log(`🧠 AI model: ${AI_MODEL}`);
  console.log(
    `⏱️ AI timeout: ${AI_TIMEOUT_MS}ms`
  );
  console.log("====================================");

  try {
    const channel =
      await client.channels.fetch(
        FOOD_CHANNEL_ID
      );

    if (!channel || !channel.isTextBased()) {
      console.error(
        "❌ Food channel not found."
      );
      return;
    }

    await ensureReminder(channel);
  } catch (error) {
    console.error(
      "Startup channel error:",
      error.message
    );
  }
});

// ==================================================
// FULL CLEANUP
// ==================================================

async function cleanupChannel(channel) {
  let deletedCount = 0;
  let lastId = null;

  while (true) {
    const options = {
      limit: 100
    };

    if (lastId) {
      options.before = lastId;
    }

    const messages =
      await channel.messages.fetch(options);

    if (messages.size === 0) {
      break;
    }

    for (const message of messages.values()) {
      const isReminder =
        message.author.id === client.user.id &&
        message.embeds.some(
          embed =>
            embed.title ===
            "🍽️ Foodie Reminder"
        ) &&
        message.pinned;

      if (isReminder) continue;
      if (!message.deletable) continue;

      try {
        await message.delete();
        deletedCount++;
      } catch (error) {
        console.log(
          "Cleanup skipped message:",
          error.message
        );
      }
    }

    lastId = messages.last().id;

    if (messages.size < 100) {
      break;
    }
  }

  return deletedCount;
}

// ==================================================
// SELECTED USER CLEANUP
// ==================================================

async function cleanupUser(channel, userId) {
  let deletedCount = 0;
  let lastId = null;

  while (true) {
    const options = {
      limit: 100
    };

    if (lastId) {
      options.before = lastId;
    }

    const messages =
      await channel.messages.fetch(options);

    if (messages.size === 0) {
      break;
    }

    for (const message of messages.values()) {
      const isReminder =
        message.author.id === client.user.id &&
        message.embeds.some(
          embed =>
            embed.title ===
            "🍽️ Foodie Reminder"
        ) &&
        message.pinned;

      if (isReminder) continue;

      if (message.author.id !== userId) {
        continue;
      }

      if (!message.deletable) continue;

      try {
        await message.delete();
        deletedCount++;
      } catch (error) {
        console.log(
          "User cleanup skipped message:",
          error.message
        );
      }
    }

    lastId = messages.last().id;

    if (messages.size < 100) {
      break;
    }
  }

  return deletedCount;
}

// ==================================================
// MESSAGE HANDLER
// ==================================================

client.on("messageCreate", async message => {
  try {
    if (!message.guild) return;

    if (message.channel.id !== FOOD_CHANNEL_ID) {
      return;
    }

    if (message.author.bot) {
      return;
    }

    // ==================================================
    // CLEANUP COMMAND
    // ==================================================

    if (
      message.content
        .trim()
        .toLowerCase()
        .startsWith("!cleanup")
    ) {
      if (
        !message.member?.permissions.has(
          PermissionsBitField.Flags.ManageMessages
        )
      ) {
        await safeDelete(message);

        const denied =
          await message.channel.send(
            "❌ You need Manage Messages permission to use `!cleanup`."
          );

        setTimeout(() => {
          safeDelete(denied);
        }, 5000);

        return;
      }

      const mentionedUser =
        message.mentions.users.first();

      await safeDelete(message);

      // ==================================================
      // SELECTED USER
      // ==================================================

      if (mentionedUser) {
        console.log(
          `🧹 Cleaning ${mentionedUser.tag}...`
        );

        const count =
          await cleanupUser(
            message.channel,
            mentionedUser.id
          );

        const confirmation =
          await message.channel.send(
            `🧹 Cleanup complete for <@${mentionedUser.id}>. Removed ${count} message(s).`
          );

        setTimeout(() => {
          safeDelete(confirmation);
        }, 5000);

        return;
      }

      // ==================================================
      // FULL CHANNEL
      // ==================================================

      console.log(
        "🧹 Starting full cleanup..."
      );

      const count =
        await cleanupChannel(
          message.channel
        );

      const confirmation =
        await message.channel.send(
          `🧹 Cleanup complete. Removed ${count} message(s).`
        );

      setTimeout(() => {
        safeDelete(confirmation);
      }, 5000);

      return;
    }

    // ==================================================
    // EXACT TRIGGER ONLY
    // ==================================================

    if (!hasExactTrigger(message.content)) {
      return;
    }

    // ==================================================
    // FIND IMAGE
    // ==================================================

    const attachments = [
      ...message.attachments.values()
    ];

    const imageAttachment =
      attachments.find(attachment =>
        isImage(attachment)
      );

    if (!imageAttachment) {
      await safeDelete(message);

      await sendPrivateMessage(
        message.author,
        "⚠️ Please send a picture with **Kain Po Tayo Team Ryzza**."
      );

      return;
    }

    // ==================================================
    // DOWNLOAD BEFORE DELETE
    // ==================================================

    const downloaded =
      await downloadAttachment(
        imageAttachment
      );

    if (!downloaded) {
      await safeDelete(message);

      await sendPrivateMessage(
        message.author,
        "⚠️ I couldn't process that picture. Please try again."
      );

      return;
    }

    // ==================================================
    // PRIVATE CHECK MESSAGE
    // ==================================================

    await sendPrivateMessage(
      message.author,
      "🔎 Checking your food picture..."
    );

    // ==================================================
    // DELETE ORIGINAL
    // ==================================================

    await safeDelete(message);

    // ==================================================
    // AI CHECK
    // ==================================================

    const isFood =
      await checkIfFood(
        imageAttachment.url
      );

    // ==================================================
    // NOT FOOD
    // ==================================================

    if (!isFood) {
      await sendPrivateMessage(
        message.author,
        "❌ No food or drink was confirmed in the picture, so it wasn't posted."
      );

      return;
    }

    // ==================================================
    // FOOD APPROVED
    // ==================================================

    const emoji = getFoodEmoji();

    const publicText =
      `**𝑲𝒂𝒊𝒏 𝑷𝒐 𝑻𝒂𝒚𝒐 𝑻𝒆𝒂𝒎 𝑹𝒚𝒛𝒛𝒂 ${emoji}**\n` +
      `👤 <@${message.author.id}>`;

    try {
      await message.channel.send({
        content: publicText,

        files: [
          {
            attachment:
              downloaded.attachment,
            name:
              downloaded.name
          }
        ],

        allowedMentions: {
          users: [message.author.id]
        }
      });

      await sendPrivateMessage(
        message.author,
        "✅ Your food picture was posted!"
      );

      console.log(
        `🍽️ Food approved for ${message.author.tag}`
      );
    } catch (error) {
      console.error(
        "Failed to publish food:",
        error.message
      );

      await sendPrivateMessage(
        message.author,
        "⚠️ The food check passed, but I couldn't publish the picture. Please try again."
      );
    }
  } catch (error) {
    console.error(
      "Message handler error:",
      error
    );
  }
});

// ==================================================
// LOGIN
// ==================================================

client.login(DISCORD_TOKEN);
