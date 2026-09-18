
const express = require("express");
const {
  Client,
  GatewayIntentBits,
  ChannelType,
  EmbedBuilder
} = require("discord.js");
const OpenAI = require("openai");

// ======================================================
// RENDER HEALTH SERVER
// ======================================================
const http = require("http");

const PORT = Number(process.env.PORT) || 10000;

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, {
      "Content-Type": "text/plain"
    });

    return res.end("OK");
  }

  res.writeHead(200, {
    "Content-Type": "text/plain"
  });

  res.end("Kain Po Tayo Team Ryzza Bot is online.");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Health server running on port ${PORT}`);
});

// ======================================================
// ENVIRONMENT VARIABLES
// ======================================================

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing!");
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY is missing!");
  process.exit(1);
}

// ======================================================
// OPENAI
// ======================================================

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

// ======================================================
// DISCORD CLIENT
// ======================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ======================================================
// SETTINGS
// ======================================================

const FOOD_CHANNEL_ID = "1550189625954402314";

const FOOD_TRIGGER = "Kain Po Tayo Team Ryzza";

const AI_MODEL = "gpt-5.6-luna";

const AI_TIMEOUT_MS = 7000;

// Member slowmode
const FOOD_SLOWMODE_SECONDS = 30;

// Bot waits 30 seconds AFTER AI approval
const BOT_POST_DELAY_MS = 30000;

// Party Chat
const PARTY_THREAD_NAME = "💬 Kain Po Tayo — Party Chat";

let partyThreadId = null;

// ======================================================
// FOOD EMOJIS
// ======================================================

const FOOD_EMOJI_LIST = [
  "🍞", "🥖", "🥐", "🍳", "🥚", "🧀", "🥨", "🫓",
  "🧈", "🥓", "🥩", "🥞", "🧇", "🍤", "🍗", "🍖",
  "🍕", "🌭", "🍟", "🥙", "🧆", "🌮", "🌯", "🫔",
  "🥘", "🍝", "🍜", "🍲", "🍥", "🥯", "🥮", "🍣",
  "🍱", "🍛", "🍚", "🍘", "🥧", "🍦", "🍨", "🍧",
  "🍡", "🍢", "🥠", "🧁", "🍰", "🎂", "🍮", "🍭",
  "🍬", "🍫", "🥛", "🍯", "🍪", "🦪", "🥟", "🍩",
  "🍿", "☕", "🍵", "🧋", "🥤", "🧃"
];

// ======================================================
// WAIT
// ======================================================

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// ======================================================
// DOWNLOAD ATTACHMENT
// ======================================================

async function downloadAttachment(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to download attachment: ${response.status}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();

  return Buffer.from(arrayBuffer);
}

// ======================================================
// PRIVATE DM
// ======================================================

async function sendPrivateDM(user, text) {
  try {
    await user.send(text);
  } catch (error) {
    console.log(
      `⚠️ Could not DM ${user.tag}: ${error.message}`
    );
  }
}

// ======================================================
// AI FOOD + EMOJI DETECTION
// ======================================================

async function checkFoodWithAI(buffer, contentType) {
  const base64 = buffer.toString("base64");

  const prompt = `
You are the food detector for a Discord food channel.

Look carefully at the entire image.

Determine:

1. Is ANY clearly visible food or drink present?
2. If yes, identify the main food or drink.
3. Choose exactly ONE matching emoji from the allowed list.

People, pets, tables, restaurants, plates, packaging,
and backgrounds do NOT make the image invalid.

If clearly visible food or drink exists, food must be true.

Allowed emojis:

${FOOD_EMOJI_LIST.join(" ")}

Examples:

Spaghetti or pasta = 🍝
Pizza = 🍕
Burger = 🍔
French fries = 🍟
Ramen/noodles = 🍜
Sushi = 🍣
Rice = 🍚
Curry = 🍛
Cake = 🍰
Cupcake = 🧁
Donut = 🍩
Ice cream = 🍦
Coffee = ☕
Tea = 🍵
Milk tea/boba = 🧋
Juice = 🧃
Soft drink = 🥤
Chicken = 🍗
Steak/beef = 🥩
Bacon = 🥓
Egg = 🥚
Shrimp = 🍤
Dumpling = 🥟
Taco = 🌮
Burrito = 🌯
Hot dog = 🌭
Popcorn = 🍿
Bread = 🍞
Croissant = 🥐
Pancakes = 🥞
Waffle = 🧇
Cheese = 🧀

Return ONLY JSON.

For food:

{
  "food": true,
  "emoji": "🍝"
}

For no food:

{
  "food": false,
  "emoji": null
}

Do not include explanations.
Do not use markdown.
Do not use an emoji outside the allowed list.
`;

  const result = await Promise.race([
    openai.responses.create({
      model: AI_MODEL,

      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: prompt
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Analyze this food picture."
            },
            {
              type: "input_image",
              image_url:
                `data:${contentType};base64,${base64}`
            }
          ]
        }
      ]
    }),

    new Promise((resolve) => {
      setTimeout(() => resolve(null), AI_TIMEOUT_MS);
    })
  ]);

  if (!result) {
    return null;
  }

  const raw =
    result.output_text?.trim() || "";

  try {
    const parsed = JSON.parse(raw);

    if (parsed.food !== true) {
      return {
        food: false,
        emoji: null
      };
    }

    if (!FOOD_EMOJI_LIST.includes(parsed.emoji)) {
      console.log(
        `⚠️ Unsupported AI emoji: ${parsed.emoji}`
      );

      return {
        food: true,
        emoji: "🍽️"
      };
    }

    return {
      food: true,
      emoji: parsed.emoji
    };
  } catch (error) {
    console.error(
      "❌ Could not parse AI response:",
      raw
    );

    return null;
  }
}

// ======================================================
// FOOD QUEUE
// ======================================================

const foodQueue = [];
let processingFood = false;

function addToFoodQueue(job) {
  foodQueue.push(job);

  console.log(
    `📥 Food submission queued. Queue: ${foodQueue.length}`
  );

  processFoodQueue();
}

async function processFoodQueue() {
  if (processingFood) {
    return;
  }

  if (foodQueue.length === 0) {
    return;
  }

  processingFood = true;

  const job = foodQueue.shift();

  try {
    await processFoodSubmission(job);
  } catch (error) {
    console.error(
      "❌ Food processing error:",
      error
    );

    await sendPrivateDM(
      job.user,
      "❌ Something went wrong while checking your food picture. Please try again."
    );
  }

  processingFood = false;

  setImmediate(processFoodQueue);
}

// ======================================================
// PROCESS FOOD
// ======================================================

async function processFoodSubmission({
  user,
  buffer,
  contentType
}) {
  console.log(
    `🔎 Checking food picture from ${user.tag}`
  );

  const result =
    await checkFoodWithAI(
      buffer,
      contentType
    );

  // AI failed
  if (result === null) {
    console.log(
      `⚠️ AI check failed for ${user.tag}`
    );

    await sendPrivateDM(
      user,
      "⚠️ I couldn't finish checking your food picture. Please try again."
    );

    return;
  }

  // No food
  if (!result.food) {
    console.log(
      `❌ No food detected for ${user.tag}`
    );

    await sendPrivateDM(
      user,
      "❌ No food or drink was confirmed in the picture, so it wasn't posted."
    );

    return;
  }

  // Food approved
  console.log(
    `✅ Food detected: ${result.emoji}`
  );

  await sendPrivateDM(
    user,
    `✅ Your food was confirmed ${result.emoji}. The bot will post it shortly.`
  );

  // ====================================================
  // BOT 30 SECOND DELAY
  // ====================================================

  console.log(
    `⏳ Waiting 30 seconds before posting for ${user.tag}.`
  );

  await wait(BOT_POST_DELAY_MS);

  // ====================================================
  // FETCH FOOD CHANNEL
  // ====================================================

  const channel =
    await client.channels.fetch(
      FOOD_CHANNEL_ID
    );

  if (!channel || !channel.isTextBased()) {
    throw new Error(
      "Food channel could not be found."
    );
  }

  // ====================================================
  // FINAL FOOD POST
  // ====================================================

  const messageContent =
    `**𝑲𝒂𝒊𝒏 𝑷𝒐 𝑻𝒂𝒚𝒐 𝑻𝒆𝒂𝒎 𝑹𝒚𝒛𝒛𝒂 ${result.emoji}**\n` +
    `👤 <@${user.id}>`;

  await channel.send({
    content: messageContent,

    files: [
      {
        attachment: buffer,
        name: `food-${Date.now()}.jpg`
      }
    ],

    allowedMentions: {
      users: [user.id]
    }
  });

  console.log(
    `🍽️ Food post sent for ${user.tag}`
  );

  // ====================================================
  // PARTY CHAT NOTIFICATION
  // ====================================================

  try {
    const partyThread =
      await ensurePartyThread(channel);

    if (partyThread) {
      await partyThread.send({
        content:
          `**Kain Po Tayo**\n🍽️ New food post from <@${user.id}>!`,

        allowedMentions: {
          users: [user.id]
        }
      });
    }
  } catch (error) {
    console.error(
      "⚠️ Could not notify Party Chat:",
      error.message
    );
  }
}

// ======================================================
// PARTY CHAT
// ======================================================

async function ensurePartyThread(channel) {
  // Cached thread
  if (partyThreadId) {
    try {
      const cachedThread =
        await client.channels.fetch(
          partyThreadId
        );

      if (cachedThread) {
        if (
          cachedThread.isThread() &&
          cachedThread.archived
        ) {
          await cachedThread.setArchived(false);
        }

        return cachedThread;
      }
    } catch {
      partyThreadId = null;
    }
  }

  // Active threads
  try {
    const activeThreads =
      await channel.threads.fetchActive();

    const existing =
      activeThreads.threads.find(
        (thread) =>
          thread.name === PARTY_THREAD_NAME
      );

    if (existing) {
      partyThreadId = existing.id;
      return existing;
    }
  } catch (error) {
    console.error(
      "⚠️ Could not fetch active Party Chat:",
      error.message
    );
  }

  // Archived threads
  try {
    const archived =
      await channel.threads.fetchArchived({
        type: "public"
      });

    const existingArchived =
      archived.threads.find(
        (thread) =>
          thread.name === PARTY_THREAD_NAME
      );

    if (existingArchived) {
      await existingArchived.setArchived(false);

      partyThreadId = existingArchived.id;

      return existingArchived;
    }
  } catch (error) {
    console.error(
      "⚠️ Could not fetch archived Party Chat:",
      error.message
    );
  }

  // Create new Party Chat
  try {
    const thread =
      await channel.threads.create({
        name: PARTY_THREAD_NAME,
        type: ChannelType.PublicThread,
        autoArchiveDuration: 10080,
        reason:
          "Create the single Kain Po Tayo Party Chat"
      });

    partyThreadId = thread.id;

    await thread.send(
      "💬 **Welcome to the Kain Po Tayo Party Chat!**\nEveryone can chat, send pictures, videos, GIFs, emojis, and stickers here."
    );

    console.log(
      "✅ Party Chat created."
    );

    return thread;
  } catch (error) {
    console.error(
      "❌ Could not create Party Chat:",
      error.message
    );

    return null;
  }
}

// ======================================================
// FOODIE REMINDER
// ======================================================

async function ensureReminder(channel) {
  try {
    const messages =
      await channel.messages.fetch({
        limit: 100
      });

    const existingReminder =
      messages.find(
        (message) =>
          message.author.id === client.user.id &&
          message.embeds.some(
            (embed) =>
              embed.title ===
              "🍽️ Foodie Reminder"
          )
      );

    if (existingReminder) {
      console.log(
        "✅ Existing Foodie Reminder found."
      );

      if (!existingReminder.pinned) {
        await existingReminder.pin(
          "Keep the Foodie Reminder visible"
        );
      }

      return existingReminder;
    }

    const embed = new EmbedBuilder()
      .setTitle("🍽️ Foodie Reminder")
      .setDescription(
        "Post your food here with **Kain Po Tayo Team Ryzza** + a picture."
      );

    const reminder =
      await channel.send({
        embeds: [embed]
      });

    await reminder.pin(
      "Keep the Foodie Reminder visible"
    );

    console.log(
      "✅ Foodie Reminder created and pinned."
    );

    return reminder;
  } catch (error) {
    console.error(
      "❌ Could not ensure Foodie Reminder:",
      error.message
    );

    return null;
  }
}

// ======================================================
// CHECK FOODIE REMINDER
// ======================================================

function isFoodieReminder(message) {
  return (
    message.author.id === client.user.id &&
    message.embeds.some(
      (embed) =>
        embed.title ===
        "🍽️ Foodie Reminder"
    )
  );
}

// ======================================================
// DOES BOT MESSAGE BELONG TO USER?
// ======================================================

function botMessageMentionsUser(message, userId) {
  // Direct Discord mention
  if (message.mentions.users.has(userId)) {
    return true;
  }

  // Extra safety: check message text for
  // the exact Discord mention format.
  if (
    message.content.includes(`<@${userId}>`) ||
    message.content.includes(`<@!${userId}>`)
  ) {
    return true;
  }

  return false;
}

// ======================================================
// CLEANUP
// ======================================================
//
// !cleanup
//      Deletes all messages in the main Foodie channel
//      except the Foodie Reminder.
//
// !cleanup @User
//      Deletes:
//      - that user's own messages
//      - bot messages that mention that user
//
// Party Chat is NEVER cleaned.
// ======================================================

async function cleanupChannel(commandMessage) {
  const channel = commandMessage.channel;

  const mentionedUser =
    commandMessage.mentions.users.first();

  let deletedCount = 0;
  let scannedCount = 0;

  let beforeId = null;

  try {
    while (true) {
      const options = {
        limit: 100
      };

      if (beforeId) {
        options.before = beforeId;
      }

      const messages =
        await channel.messages.fetch(options);

      if (messages.size === 0) {
        break;
      }

      scannedCount += messages.size;

      // Discord returns newest -> oldest.
      // Save the oldest ID for the next page.
      beforeId =
        messages.last().id;

      for (const msg of messages.values()) {
        // ALWAYS preserve the Foodie Reminder.
        if (isFoodieReminder(msg)) {
          continue;
        }

        // ------------------------------------------------
        // !cleanup @User
        // ------------------------------------------------

        if (mentionedUser) {
          let shouldDelete = false;

          // Delete the user's own message.
          if (
            msg.author.id ===
            mentionedUser.id
          ) {
            shouldDelete = true;
          }

          // Also delete bot food posts that mention
          // that user.
          if (
            msg.author.bot &&
            botMessageMentionsUser(
              msg,
              mentionedUser.id
            )
          ) {
            shouldDelete = true;
          }

          if (!shouldDelete) {
            continue;
          }
        }

        // ------------------------------------------------
        // !cleanup with NO mention
        // ------------------------------------------------
        //
        // Delete everything except the Reminder,
        // including bot-generated food posts.
        // ------------------------------------------------

        try {
          await msg.delete();
          deletedCount++;
        } catch (error) {
          console.log(
            `⚠️ Could not delete message ${msg.id}: ${error.message}`
          );
        }
      }

      // If fewer than 100 messages were returned,
      // we've reached the end of the channel history.
      if (messages.size < 100) {
        break;
      }
    }

    console.log(
      `🧹 Cleanup scanned ${scannedCount} messages and deleted ${deletedCount}.`
    );

    const targetText = mentionedUser
      ? ` for ${mentionedUser}`
      : "";

    const confirmation =
      await channel.send(
        `🧹 Cleanup complete${targetText}. Deleted **${deletedCount}** message(s).`
      );

    setTimeout(async () => {
      try {
        await confirmation.delete();
      } catch {
        // Ignore
      }
    }, 5000);
  } catch (error) {
    console.error(
      "❌ Cleanup error:",
      error
    );
  }
}

// ======================================================
// MAIN MESSAGE HANDLER
// ======================================================

client.on("messageCreate", async (message) => {
  // Never moderate bot messages.
  if (message.author.bot) {
    return;
  }

  // Only moderate the main Foodie channel.
  if (message.channel.id !== FOOD_CHANNEL_ID) {
    return;
  }

  // ====================================================
  // CLEANUP COMMAND
  // ====================================================

  if (
    message.content
      .trim()
      .toLowerCase()
      .startsWith("!cleanup")
  ) {
    // Delete command first.
    try {
      await message.delete();
    } catch {
      // Ignore
    }

    await cleanupChannel(message);

    return;
  }

  // ====================================================
  // MESSAGE INFORMATION
  // ====================================================

  const content =
    message.content.trim();

  const isExactTrigger =
    content.toLowerCase() ===
    FOOD_TRIGGER.toLowerCase();

  const imageAttachment =
    message.attachments.find(
      (attachment) =>
        attachment.contentType?.startsWith(
          "image/"
        )
    );

  const videoAttachment =
    message.attachments.find(
      (attachment) =>
        attachment.contentType?.startsWith(
          "video/"
        )
    );

  const hasAttachment =
    message.attachments.size > 0;

  // ====================================================
  // VALID FOOD PICTURE
  // ====================================================

  if (
    isExactTrigger &&
    imageAttachment
  ) {
    try {
      // Download BEFORE deleting.
      const buffer =
        await downloadAttachment(
          imageAttachment.url
        );

      // Delete original user message.
      await message.delete();

      // Add to queue.
      addToFoodQueue({
        user: message.author,
        buffer,
        contentType:
          imageAttachment.contentType ||
          "image/jpeg"
      });

      return;
    } catch (error) {
      console.error(
        "❌ Could not process food image:",
        error.message
      );

      try {
        await message.delete();
      } catch {
        // Ignore
      }

      await sendPrivateDM(
        message.author,
        "❌ I couldn't read that picture. Please try sending it again."
      );

      return;
    }
  }

  // ====================================================
  // VIDEO
  // ====================================================

  if (
    isExactTrigger &&
    videoAttachment
  ) {
    try {
      await message.delete();
    } catch {
      // Ignore
    }

    await sendPrivateDM(
      message.author,
      "❌ Please send a food picture with **Kain Po Tayo Team Ryzza**. Video food checking is not enabled yet."
    );

    return;
  }

  // ====================================================
  // DELETE EVERYTHING ELSE
  // ====================================================

  try {
    await message.delete();
  } catch (error) {
    console.error(
      `⚠️ Could not delete message from ${message.author.tag}:`,
      error.message
    );
  }

  // Picture/file without trigger
  if (!isExactTrigger && hasAttachment) {
    await sendPrivateDM(
      message.author,
      "❌ Please use **Kain Po Tayo Team Ryzza** with your food picture when posting in the Foodie channel."
    );

    return;
  }

  // Trigger without picture
  if (isExactTrigger && !hasAttachment) {
    await sendPrivateDM(
      message.author,
      "❌ Please send a food picture together with **Kain Po Tayo Team Ryzza**."
    );

    return;
  }

  // Normal text, emoji, sticker, GIF, etc.
  // Deleted silently.
});

// ======================================================
// BOT READY
// ======================================================

client.once("ready", async () => {
  console.log(
    `✅ Logged in as ${client.user.tag}`
  );

  try {
    const channel =
      await client.channels.fetch(
        FOOD_CHANNEL_ID
      );

    if (!channel || !channel.isTextBased()) {
      console.error(
        "❌ Food channel is invalid."
      );

      return;
    }

    // 30-second member slowmode
    try {
      await channel.setRateLimitPerUser(
        FOOD_SLOWMODE_SECONDS,
        "Kain Po Tayo Team Ryzza Foodie slowmode"
      );

      console.log(
        "✅ Member slowmode: 30 seconds"
      );
    } catch (error) {
      console.error(
        "⚠️ Could not set slowmode:",
        error.message
      );
    }

    // Reminder
    await ensureReminder(channel);

    // Single Party Chat
    await ensurePartyThread(channel);

    console.log(
      "🍽️ Kain Po Tayo Team Ryzza Foodie system is ready."
    );
  } catch (error) {
    console.error(
      "❌ Ready setup error:",
      error
    );
  }
});

// ======================================================
// LOGIN
// ======================================================

client.login(DISCORD_TOKEN);
