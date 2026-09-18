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

// Target AI checking time
// 1 second is the target, but actual API/network time can vary.
const AI_TIMEOUT_MS = 1000;

// ==================================================
// CHECK ENVIRONMENT VARIABLES
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

function isVideo(attachment) {
  return attachment.contentType?.startsWith("video/");
}

function safeUserMention(userId) {
  return `<@${userId}>`;
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
// DOWNLOAD ATTACHMENT
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
            text:
              "Look at this image. Reply with ONLY FOOD if the image clearly shows food or a food/drink item. Reply with ONLY NOT_FOOD if it does not."
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

    return result === "FOOD";
  } catch (error) {
    console.log("AI check failed/timeout:", error.message);

    // Fail closed:
    // If AI cannot verify it quickly, don't publish it.
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
// FOOD REMINDER
// ==================================================

async function ensureReminder(channel) {
  try {
    // Look through recent messages first.
    // This prevents another reminder from being created
    // even if an older reminder was not pinned.
    const recentMessages = await channel.messages.fetch({
      limit: 100
    });

    const existingReminder = recentMessages.find(message =>
      message.author.id === client.user.id &&
      message.embeds.some(
        embed => embed.title === "🍽️ Foodie Reminder"
      )
    );

    if (existingReminder) {
      // If the existing reminder is not pinned, pin it.
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

      console.log("✅ Existing Foodie Reminder found.");
      return;
    }

    // Create only if one does not already exist.
    const reminder = new EmbedBuilder()
      .setTitle("🍽️ Foodie Reminder")
      .setDescription(
        "Post your food here with **Kain Po Tayo Team Ryzza** + a picture."
      );

    const reminderMessage = await channel.send({
      embeds: [reminder]
    });

    await reminderMessage.pin();

    console.log("📌 Foodie Reminder created and pinned.");
  } catch (error) {
    console.error(
      "Reminder error:",
      error.message
    );
  }
}

// ==================================================
// READY
// ==================================================

client.once("ready", async () => {
  console.log("====================================");
  console.log(`🤖 Logged in as ${client.user.tag}`);
  console.log(`📢 Food channel: ${FOOD_CHANNEL_ID}`);
  console.log(`🔑 Trigger: ${TRIGGER}`);
  console.log(`🧠 AI model: ${AI_MODEL}`);
  console.log(`⏱️ AI target: ${AI_TIMEOUT_MS}ms`);
  console.log("====================================");

  try {
    const channel = await client.channels.fetch(
      FOOD_CHANNEL_ID
    );

    if (!channel || !channel.isTextBased()) {
      console.error("❌ Food channel not found.");
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
// CLEANUP
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

    const messages = await channel.messages.fetch(options);

    if (messages.size === 0) {
      break;
    }

    const twoWeeksAgo =
      Date.now() - 14 * 24 * 60 * 60 * 1000;

    for (const message of messages.values()) {
      // NEVER delete the pinned Foodie Reminder.
      const isReminder =
        message.author.id === client.user.id &&
        message.embeds.some(
          embed => embed.title === "🍽️ Foodie Reminder"
        ) &&
        message.pinned;

      if (isReminder) {
        continue;
      }

      if (!message.deletable) {
        continue;
      }

      try {
        if (message.createdTimestamp > twoWeeksAgo) {
          await message.delete();
          deletedCount++;
        } else {
          await message.delete();
          deletedCount++;
        }
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
// CLEANUP USER
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

    const messages = await channel.messages.fetch(options);

    if (messages.size === 0) {
      break;
    }

    for (const message of messages.values()) {
      // Never delete the pinned reminder.
      const isReminder =
        message.author.id === client.user.id &&
        message.embeds.some(
          embed => embed.title === "🍽️ Foodie Reminder"
        ) &&
        message.pinned;

      if (isReminder) {
        continue;
      }

      if (message.author.id !== userId) {
        continue;
      }

      if (!message.deletable) {
        continue;
      }

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
    // Ignore DMs.
    if (!message.guild) return;

    // Only work in the food channel.
    if (message.channel.id !== FOOD_CHANNEL_ID) {
      return;
    }

    // Ignore other bots.
    if (message.author.bot) {
      return;
    }

    // ==================================================
    // !CLEANUP
    // ==================================================

    if (
      message.content
        .trim()
        .toLowerCase()
        .startsWith("!cleanup")
    ) {
      // Permission check before deleting command.
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

      const parts = message.content.trim().split(/\s+/);

      // !cleanup @User
      const mentionedUser =
        message.mentions.users.first();

      // Delete command.
      await safeDelete(message);

      // ==================================================
      // SELECTED USER CLEANUP
      // ==================================================

      if (mentionedUser) {
        console.log(
          `🧹 Cleaning messages from ${mentionedUser.tag}...`
        );

        const count = await cleanupUser(
          message.channel,
          mentionedUser.id
        );

        const confirmation =
          await message.channel.send(
            `🧹 Cleanup complete for ${safeUserMention(
              mentionedUser.id
            )}. Removed ${count} message(s).`
          );

        setTimeout(() => {
          safeDelete(confirmation);
        }, 5000);

        return;
      }

      // ==================================================
      // FULL CLEANUP
      // ==================================================

      console.log("🧹 Starting full cleanup...");

      const count = await cleanupChannel(
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
    // NORMAL CHAT
    // ==================================================

    // Exact trigger only.
    // Normal chatting never reaches AI.
    if (!hasExactTrigger(message.content)) {
      return;
    }

    // ==================================================
    // TRIGGER WITHOUT IMAGE
    // ==================================================

    const attachments = [
      ...message.attachments.values()
    ];

    const imageAttachment = attachments.find(
      attachment => isImage(attachment)
    );

    // We require an image.
    if (!imageAttachment) {
      await safeDelete(message);

      await sendPrivateMessage(
        message.author,
        "⚠️ Please send a food picture together with **Kain Po Tayo Team Ryzza**."
      );

      return;
    }

    // ==================================================
    // DOWNLOAD IMAGE FIRST
    // ==================================================

    const downloaded = await downloadAttachment(
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
    // PRIVATE CHECKING MESSAGE
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
    // AI FOOD CHECK
    // ==================================================

    const isFood = await checkIfFood(
      imageAttachment.url
    );

    // ==================================================
    // NOT FOOD
    // ==================================================

    if (!isFood) {
      await sendPrivateMessage(
        message.author,
        "❌ This picture wasn't confirmed as food, so it wasn't posted."
      );

      return;
    }

    // ==================================================
    // FOOD APPROVED
    // ==================================================

    const emoji = getFoodEmoji();

    const publicText =
      `**𝑲𝒂𝒊𝒏 𝑷𝒐 𝑻𝒂𝒚𝒐 𝑻𝒆𝒂𝒎 𝑹𝒚𝒛𝒛𝒂 ${emoji}**\n` +
      `👤 ${safeUserMention(message.author.id)}`;

    try {
      await message.channel.send({
        content: publicText,

        files: [
          {
            attachment: downloaded.attachment,
            name: downloaded.name
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
