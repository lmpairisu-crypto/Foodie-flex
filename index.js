const express = require("express");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const ffmpegPath = require("ffmpeg-static");

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  PermissionsBitField
} = require("discord.js");

// ==================================================
// HEALTH SERVER
// ==================================================

const app = express();
const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
  res.send("Kain Po Tayo Team Ryzza Bot is online!");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Health server running on port ${PORT}`);
});

// ==================================================
// VARIABLES
// ==================================================

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// FOOD CHANNEL ID
const FOOD_CHANNEL_ID = "1550189625954402314";

// TRIGGER
const TRIGGER = "kain po tayo team ryzza";

// CLEANUP COMMAND
const CLEANUP_COMMAND = "!cleanup";

if (!DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing!");
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY is missing!");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
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
// LOG HELPER
// ==================================================

function section(title) {
  console.log("");
  console.log("========================================");
  console.log(title);
  console.log("========================================");
}

// ==================================================
// MESSAGE TEXT
// ==================================================

function getMessageText(message) {
  if (
    message.content &&
    message.content.trim()
  ) {
    return message.content;
  }

  return "[NO TEXT]";
}

// ==================================================
// ATTACHMENT NAMES
// ==================================================

function getAttachmentNames(message) {
  const files = [
    ...message.attachments.values()
  ];

  if (files.length === 0) {
    return "NONE";
  }

  return files
    .map(
      (file) =>
        file.name ||
        file.contentType ||
        "UNKNOWN"
    )
    .join(", ");
}

// ==================================================
// DELETE MESSAGE
// ==================================================

async function deleteMessage(
  message,
  type,
  reason
) {
  section("🗑️ MESSAGE DELETED");

  console.log(
    `Author: ${message.author.tag}`
  );

  console.log(
    `Author ID: ${message.author.id}`
  );

  console.log(
    `Message ID: ${message.id}`
  );

  console.log(
    `Channel ID: ${message.channel.id}`
  );

  console.log(
    `Type: ${type}`
  );

  console.log(
    `Content: ${getMessageText(message)}`
  );

  console.log(
    `Attachments: ${getAttachmentNames(message)}`
  );

  console.log(
    `Stickers: ${message.stickers.size}`
  );

  console.log(
    `Reason: ${reason}`
  );

  try {
    await message.delete();

    console.log(
      `✅ DELETE SUCCESS: ${message.id}`
    );

  } catch (error) {
    console.error(
      `❌ DELETE FAILED: ${message.id}`
    );

    console.error(
      error.message
    );
  }

  console.log(
    "========================================"
  );
}

// ==================================================
// DOWNLOAD FILE
// ==================================================

async function downloadFile(
  url,
  outputPath
) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Download failed: ${response.status} ${response.statusText}`
    );
  }

  const buffer =
    Buffer.from(
      await response.arrayBuffer()
    );

  fs.writeFileSync(
    outputPath,
    buffer
  );

  return outputPath;
}

// ==================================================
// RUN FFMPEG
// ==================================================

function runFFmpeg(args) {
  return new Promise(
    (resolve, reject) => {
      execFile(
        ffmpegPath,
        args,
        {
          windowsHide: true
        },
        (
          error,
          stdout,
          stderr
        ) => {
          if (error) {
            console.error(
              "FFmpeg error:",
              stderr
            );

            reject(error);
            return;
          }

          resolve({
            stdout,
            stderr
          });
        }
      );
    }
  );
}

// ==================================================
// CLEAN TEMP DIRECTORY
// ==================================================

function cleanupDirectory(
  directory
) {
  try {
    if (
      fs.existsSync(directory)
    ) {
      fs.rmSync(
        directory,
        {
          recursive: true,
          force: true
        }
      );
    }
  } catch (error) {
    console.error(
      "Cleanup failed:",
      error.message
    );
  }
}

// ==================================================
// EXTRACT FRAMES
// ==================================================

async function extractFrames(
  url,
  extension
) {
  const tempDir =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        "foodie-flex-"
      )
    );

  const inputPath =
    path.join(
      tempDir,
      `input.${extension}`
    );

  await downloadFile(
    url,
    inputPath
  );

  const outputPattern =
    path.join(
      tempDir,
      "frame-%02d.jpg"
    );

  try {
    await runFFmpeg([
      "-y",
      "-i",
      inputPath,
      "-vf",
      "fps=1/2,scale=768:-2",
      "-frames:v",
      "4",
      "-q:v",
      "5",
      outputPattern
    ]);

    let files =
      fs
        .readdirSync(
          tempDir
        )
        .filter(
          (file) =>
            /^frame-\d+\.jpg$/i.test(
              file
            )
        )
        .sort();

    // FALLBACK FRAME
    if (
      files.length === 0
    ) {
      const fallback =
        path.join(
          tempDir,
          "single.jpg"
        );

      await runFFmpeg([
        "-y",
        "-i",
        inputPath,
        "-frames:v",
        "1",
        "-q:v",
        "5",
        fallback
      ]);

      if (
        fs.existsSync(
          fallback
        )
      ) {
        files = [
          "single.jpg"
        ];
      }
    }

    return {
      tempDir,
      framePaths:
        files.map(
          (file) =>
            path.join(
              tempDir,
              file
            )
        )
    };

  } catch (error) {
    cleanupDirectory(
      tempDir
    );

    throw error;
  }
}

// ==================================================
// IMAGE DATA URL
// ==================================================

function imageDataUrl(
  filePath
) {
  const buffer =
    fs.readFileSync(
      filePath
    );

  return (
    "data:image/jpeg;base64," +
    buffer.toString(
      "base64"
    )
  );
}

// ==================================================
// AI FOOD CHECK
// ==================================================

async function aiFoodCheck(
  framePaths
) {
  if (
    !framePaths ||
    framePaths.length === 0
  ) {
    console.log(
      "❌ No frames available for AI."
    );

    return false;
  }

  try {
    const content = [
      {
        type: "input_text",
        text:
          "Check these frames from one Discord media post. " +
          "Reply ONLY YES if food or a food/drink item " +
          "is clearly shown as a main subject in at least one frame. " +
          "Reply ONLY NO otherwise. " +
          "People, animals, scenery, screenshots, memes, logos, " +
          "documents and ordinary objects are not food."
      }
    ];

    for (
      const frame of framePaths
    ) {
      content.push({
        type: "input_image",
        image_url:
          imageDataUrl(frame)
      });
    }

    console.log(
      "🤖 Sending media to AI..."
    );

    const response =
      await openai.responses.create({
        model:
          "gpt-5.6-luna",
        input: [
          {
            role: "user",
            content
          }
        ]
      });

    const result =
      response.output_text
        .trim()
        .toUpperCase();

    console.log(
      `🤖 AI RESULT: ${result}`
    );

    return (
      result === "YES"
    );

  } catch (error) {
    console.error(
      "❌ AI CHECK FAILED:",
      error.message
    );

    return false;
  }
}

// ==================================================
// CHECK IMAGE / GIF
// ==================================================

async function checkImage(
  attachment
) {
  const name =
    (
      attachment.name ||
      ""
    ).toLowerCase();

  const isGif =
    attachment.contentType ===
      "image/gif" ||
    name.endsWith(".gif");

  const extension =
    isGif
      ? "gif"
      : (
          name.match(
            /\.(jpg|jpeg|png|webp)$/i
          )?.[1] ||
          "jpg"
        );

  console.log(
    `🔎 Checking ${
      isGif
        ? "GIF"
        : "IMAGE"
    } with AI...`
  );

  const extracted =
    await extractFrames(
      attachment.url,
      extension
    );

  try {
    return await aiFoodCheck(
      extracted.framePaths
    );

  } finally {
    cleanupDirectory(
      extracted.tempDir
    );
  }
}

// ==================================================
// CHECK VIDEO
// ==================================================

async function checkVideo(
  attachment
) {
  console.log(
    "🎥 Checking VIDEO with AI..."
  );

  const name =
    (
      attachment.name ||
      ""
    ).toLowerCase();

  const extension =
    name.match(
      /\.(mp4|mov|webm|mkv|avi)$/i
    )?.[1] ||
    "mp4";

  const extracted =
    await extractFrames(
      attachment.url,
      extension
    );

  try {
    return await aiFoodCheck(
      extracted.framePaths
    );

  } finally {
    cleanupDirectory(
      extracted.tempDir
    );
  }
}

// ==================================================
// FIND MEDIA
// ==================================================

function findMedia(
  message
) {
  const attachments =
    [
      ...message.attachments.values()
    ];

  const image =
    attachments.find(
      (attachment) => {
        const type =
          attachment.contentType ||
          "";

        const name =
          (
            attachment.name ||
            ""
          ).toLowerCase();

        return (
          type.startsWith(
            "image/"
          ) ||
          /\.(jpg|jpeg|png|webp|gif)$/i.test(
            name
          )
        );
      }
    );

  const video =
    attachments.find(
      (attachment) => {
        const type =
          attachment.contentType ||
          "";

        const name =
          (
            attachment.name ||
            ""
          ).toLowerCase();

        return (
          type.startsWith(
            "video/"
          ) ||
          /\.(mp4|mov|webm|mkv|avi)$/i.test(
            name
          )
        );
      }
    );

  const audio =
    attachments.find(
      (attachment) => {
        const type =
          attachment.contentType ||
          "";

        const name =
          (
            attachment.name ||
            ""
          ).toLowerCase();

        return (
          type.startsWith(
            "audio/"
          ) ||
          /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(
            name
          )
        );
      }
    );

  return {
    image,
    video,
    audio
  };
}

// ==================================================
// GET MESSAGE TYPE
// ==================================================

function getMediaType(
  image,
  video,
  audio,
  hasSticker
) {
  if (hasSticker) {
    return "STICKER";
  }

  if (audio) {
    return "VOICE / AUDIO";
  }

  if (video) {
    return "VIDEO";
  }

  if (image) {
    const name =
      (
        image.name ||
        ""
      ).toLowerCase();

    const isGif =
      image.contentType ===
        "image/gif" ||
      name.endsWith(".gif");

    return isGif
      ? "GIF"
      : "IMAGE";
  }

  return "TEXT / EMOJI";
}

// ==================================================
// CLEAN ONE OLD MESSAGE
// ==================================================

async function cleanOldMessage(
  oldMessage,
  stats,
  commandMessageId
) {
  // Never delete the cleanup command itself
  if (
    oldMessage.id ===
    commandMessageId
  ) {
    return;
  }

  // Never delete Foodie Flex messages
  if (
    oldMessage.author.id ===
    client.user.id
  ) {
    return;
  }

  stats.scanned++;

  const content =
    (
      oldMessage.content ||
      ""
    ).trim();

  const hasTrigger =
    content
      .toLowerCase()
      .includes(
        TRIGGER
      );

  const hasSticker =
    oldMessage.stickers.size >
    0;

  const {
    image,
    video,
    audio
  } = findMedia(
    oldMessage
  );

  const type =
    getMediaType(
      image,
      video,
      audio,
      hasSticker
    );

  // ----------------------------------------------
  // TEXT / EMOJI
  // ----------------------------------------------

  if (
    !image &&
    !video &&
    !audio &&
    !hasSticker
  ) {
    await deleteMessage(
      oldMessage,
      "OLD TEXT / EMOJI",
      "Manual cleanup: text/emojis are not allowed"
    );

    stats.deleted++;
    return;
  }

  // ----------------------------------------------
  // STICKER
  // ----------------------------------------------

  if (hasSticker) {
    await deleteMessage(
      oldMessage,
      "OLD STICKER",
      "Manual cleanup: stickers are not allowed"
    );

    stats.deleted++;
    return;
  }

  // ----------------------------------------------
  // AUDIO
  // ----------------------------------------------

  if (audio) {
    await deleteMessage(
      oldMessage,
      "OLD VOICE / AUDIO",
      "Manual cleanup: voice/audio is not allowed"
    );

    stats.deleted++;
    return;
  }

  // ----------------------------------------------
  // MEDIA WITHOUT TRIGGER
  // ----------------------------------------------

  if (!hasTrigger) {
    await deleteMessage(
      oldMessage,
      `OLD ${type}`,
      "Manual cleanup: trigger missing"
    );

    stats.deleted++;
    return;
  }

  // ----------------------------------------------
  // TRIGGER WITHOUT MEDIA
  // ----------------------------------------------

  if (
    !image &&
    !video
  ) {
    await deleteMessage(
      oldMessage,
      "OLD TEXT",
      "Manual cleanup: trigger found but no food media"
    );

    stats.deleted++;
    return;
  }

  // ----------------------------------------------
  // VIDEO + TRIGGER
  // ----------------------------------------------

  if (video) {
    console.log(
      `🤖 OLD VIDEO AI CHECK: ${oldMessage.id}`
    );

    let isFood = false;

    try {
      isFood =
        await checkVideo(
          video
        );
    } catch (error) {
      console.error(
        "Old video AI error:",
        error.message
      );
    }

    if (!isFood) {
      await deleteMessage(
        oldMessage,
        "OLD VIDEO",
        "Manual cleanup: AI determined video is not food"
      );

      stats.deleted++;

    } else {
      console.log(
        `✅ OLD FOOD VIDEO KEPT: ${oldMessage.id}`
      );

      stats.kept++;
    }

    return;
  }

  // ----------------------------------------------
  // IMAGE / GIF + TRIGGER
  // ----------------------------------------------

  if (image) {
    const name =
      (
        image.name ||
        ""
      ).toLowerCase();

    const isGif =
      image.contentType ===
        "image/gif" ||
      name.endsWith(".gif");

    console.log(
      `🤖 OLD ${
        isGif
          ? "GIF"
          : "IMAGE"
      } AI CHECK: ${oldMessage.id}`
    );

    let isFood = false;

    try {
      isFood =
        await checkImage(
          image
        );
    } catch (error) {
      console.error(
        "Old image AI error:",
        error.message
      );
    }

    if (!isFood) {
      await deleteMessage(
        oldMessage,
        isGif
          ? "OLD GIF"
          : "OLD IMAGE",
        `Manual cleanup: AI determined ${
          isGif
            ? "GIF"
            : "image"
        } is not food`
      );

      stats.deleted++;

    } else {
      console.log(
        `✅ OLD FOOD ${
          isGif
            ? "GIF"
            : "IMAGE"
        } KEPT: ${oldMessage.id}`
      );

      stats.kept++;
    }

    return;
  }
}

// ==================================================
// MANUAL CLEANUP
// ==================================================

async function runManualCleanup(
  commandMessage
) {
  section(
    "🧹 MANUAL CLEANUP STARTED"
  );

  console.log(
    `Requested by: ${commandMessage.author.tag}`
  );

  console.log(
    `Channel: ${FOOD_CHANNEL_ID}`
  );

  const stats = {
    scanned: 0,
    deleted: 0,
    kept: 0
  };

  let lastId =
    commandMessage.id;

  try {
    while (true) {
      const messages =
        await commandMessage.channel.messages.fetch({
          limit: 100,
          before: lastId
        });

      if (
        messages.size === 0
      ) {
        break;
      }

      console.log(
        `📚 Fetched ${messages.size} old messages`
      );

      lastId =
        messages.last().id;

      for (
        const oldMessage of messages.values()
      ) {
        try {
          await cleanOldMessage(
            oldMessage,
            stats,
            commandMessage.id
          );

          // Small pause to reduce
          // Discord rate-limit pressure.
          await new Promise(
            (resolve) =>
              setTimeout(
                resolve,
                150
              )
          );

        } catch (error) {
          console.error(
            `❌ Cleanup error for ${oldMessage.id}:`,
            error.message
          );
        }
      }

      if (
        messages.size < 100
      ) {
        break;
      }
    }

    section(
      "✅ MANUAL CLEANUP COMPLETE"
    );

    console.log(
      `Messages scanned: ${stats.scanned}`
    );

    console.log(
      `Messages deleted: ${stats.deleted}`
    );

    console.log(
      `Food messages kept: ${stats.kept}`
    );

    // Delete the !cleanup command
    await commandMessage
      .delete()
      .catch(() => {});

    const result =
      await commandMessage.channel.send({
        content:
          `🧹 **Cleanup complete.**\n` +
          `Scanned: **${stats.scanned}** messages\n` +
          `Deleted: **${stats.deleted}** messages\n` +
          `Food kept: **${stats.kept}** messages`
      });

    // Remove the result after 15 seconds
    setTimeout(
      () => {
        result
          .delete()
          .catch(() => {});
      },
      15000
    );

  } catch (error) {
    console.error(
      "❌ MANUAL CLEANUP FAILED:",
      error
    );

    await commandMessage
      .delete()
      .catch(() => {});

    await commandMessage.channel
      .send({
        content:
          "❌ Cleanup failed. Check the Render logs."
      })
      .catch(() => {});
  }
}

// ==================================================
// FOODIE REMINDER
// ==================================================

async function sendFoodReminder() {
  try {
    const channel =
      await client.channels.fetch(
        FOOD_CHANNEL_ID
      );

    if (
      !channel ||
      !channel.isTextBased()
    ) {
      console.error(
        "❌ Food channel not found."
      );

      return;
    }

    const messages =
      await channel.messages.fetch({
        limit: 50
      });

    const existing =
      messages.find(
        (message) =>
          message.author.id ===
            client.user.id &&
          message.embeds.length > 0 &&
          message.embeds[0].title ===
            "🍽️ Foodie Reminder"
      );

    if (existing) {
      if (!existing.pinned) {
        await existing
          .pin()
          .catch(() => {});
      }

      console.log(
        "🍽️ Foodie Reminder already exists."
      );

      return;
    }

    const embed =
      new EmbedBuilder()
        .setTitle(
          "🍽️ Foodie Reminder"
        )
        .setDescription(
          "\u200B\n" +
          "**To post your food picture:**\n\n" +
          "Say **Kain Po Tayo Team Ryzza**\n" +
          "together with your food picture.\n\n" +
          "\u200B\n" +
          "🤖 **The Bot**\n\n" +
          "will check your picture and only allow food pictures."
        );

    const reminder =
      await channel.send({
        embeds: [embed]
      });

    await reminder.pin();

    console.log(
      `🍽️ Reminder sent and pinned: ${reminder.id}`
    );

  } catch (error) {
    console.error(
      "❌ Reminder error:",
      error.message
    );
  }
}

// ==================================================
// BOT READY
// ==================================================

client.once(
  "ready",
  async () => {
    section(
      "🤖 FOODIE FLEX ONLINE"
    );

    console.log(
      `Logged in as: ${client.user.tag}`
    );

    console.log(
      `Bot ID: ${client.user.id}`
    );

    console.log(
      `Food Channel ID: ${FOOD_CHANNEL_ID}`
    );

    console.log(
      "AI food checking: ENABLED"
    );

    console.log(
      "Fast deletion: ENABLED"
    );

    console.log(
      "Manual cleanup: ENABLED"
    );

    console.log(
      "========================================"
    );

    await sendFoodReminder();
  }
);

// ==================================================
// MAIN MESSAGE HANDLER
// ==================================================

client.on(
  "messageCreate",
  async (message) => {

    // ==================================================
    // ONLY FOOD CHANNEL
    // ==================================================

    if (
      message.channel.id !==
      FOOD_CHANNEL_ID
    ) {
      return;
    }

    // ==================================================
    // IGNORE FOODIE FLEX'S OWN MESSAGES
    // ==================================================

    if (
      message.author.id ===
      client.user.id
    ) {
      return;
    }

    // ==================================================
    // MANUAL CLEANUP COMMAND
    // ==================================================

    const commandContent =
      (
        message.content ||
        ""
      )
        .trim()
        .toLowerCase();

    if (
      commandContent ===
      CLEANUP_COMMAND
    ) {

      // Must have Manage Messages
      if (
        !message.member ||
        !message.member.permissions.has(
          PermissionsBitField.Flags.ManageMessages
        )
      ) {
        await message.reply(
          "❌ You need the **Manage Messages** permission to use `!cleanup`."
        ).catch(() => {});

        return;
      }

      console.log(
        `🧹 Cleanup requested by ${message.author.tag}`
      );

      await runManualCleanup(
        message
      );

      return;
    }

    // ==================================================
    // MESSAGE LOG
    // ==================================================

    section(
      "📨 MESSAGE RECEIVED"
    );

    console.log(
      `Message ID: ${message.id}`
    );

    console.log(
      `Channel ID: ${message.channel.id}`
    );

    console.log(
      `Author: ${message.author.tag}`
    );

    console.log(
      `Author ID: ${message.author.id}`
    );

    console.log(
      `Content: ${getMessageText(message)}`
    );

    console.log(
      `Attachments: ${message.attachments.size}`
    );

    console.log(
      `Attachment Names: ${getAttachmentNames(message)}`
    );

    console.log(
      `Stickers: ${message.stickers.size}`
    );

    try {

      // ==================================================
      // OTHER BOT
      // ==================================================

      if (
        message.author.bot
      ) {
        await deleteMessage(
          message,
          "BOT MESSAGE",
          "Other bot messages are not allowed"
        );

        return;
      }

      // ==================================================
      // CONTENT
      // ==================================================

      const content =
        (
          message.content ||
          ""
        ).trim();

      const lowerContent =
        content.toLowerCase();

      const hasTrigger =
        lowerContent.includes(
          TRIGGER
        );

      // ==================================================
      // MEDIA
      // ==================================================

      const {
        image,
        video,
        audio
      } = findMedia(
        message
      );

      const hasSticker =
        message.stickers.size >
        0;

      // ==================================================
      // FAST DELETE
      // ==================================================

      // TEXT / EMOJI
      if (
        !image &&
        !video &&
        !audio &&
        !hasSticker
      ) {
        await deleteMessage(
          message,
          "TEXT / EMOJI",
          "Text and emojis are not allowed in the food channel"
        );

        return;
      }

      // STICKER
      if (hasSticker) {
        await deleteMessage(
          message,
          "STICKER",
          "Stickers are not allowed"
        );

        return;
      }

      // AUDIO
      if (audio) {
        await deleteMessage(
          message,
          "VOICE / AUDIO",
          "Voice/audio messages are not allowed"
        );

        return;
      }

      // ==================================================
      // MEDIA WITHOUT TRIGGER
      // ==================================================

      if (!hasTrigger) {

        const type =
          getMediaType(
            image,
            video,
            audio,
            hasSticker
          );

        await deleteMessage(
          message,
          type,
          "Trigger missing — media posts require Kain Po Tayo Team Ryzza"
        );

        return;
      }

      // ==================================================
      // TRIGGER WITHOUT MEDIA
      // ==================================================

      if (
        !image &&
        !video
      ) {
        await deleteMessage(
          message,
          "TEXT ONLY",
          "Trigger found but no image/GIF/video was attached"
        );

        return;
      }

      // ==================================================
      // VIDEO + TRIGGER
      // ==================================================

      if (video) {

        console.log(
          "🎥 Trigger found."
        );

        console.log(
          "🤖 Starting video AI check..."
        );

        let isFood = false;

        try {
          isFood =
            await checkVideo(
              video
            );
        } catch (error) {
          console.error(
            "❌ Video AI check failed:",
            error.message
          );
        }

        if (!isFood) {
          await deleteMessage(
            message,
            "VIDEO",
            "AI determined that the video is not food"
          );

          return;
        }

        console.log(
          "✅ AI APPROVED — FOOD VIDEO"
        );

        const originalId =
          message.id;

        await message.delete();

        const reposted =
          await message.channel.send({
            content:
              "Kain Po Tayo Team Ryzza 🍽️",
            files: [
              video.url
            ]
          });

        section(
          "✅ FOOD VIDEO APPROVED"
        );

        console.log(
          `Original: ${originalId}`
        );

        console.log(
          `Reposted: ${reposted.id}`
        );

        return;
      }

      // ==================================================
      // IMAGE / GIF + TRIGGER
      // ==================================================

      if (image) {

        const name =
          (
            image.name ||
            ""
          ).toLowerCase();

        const isGif =
          image.contentType ===
            "image/gif" ||
          name.endsWith(".gif");

        console.log(
          `🖼️ ${
            isGif
              ? "GIF"
              : "IMAGE"
          } + TRIGGER`
        );

        console.log(
          "🤖 Starting AI food check..."
        );

        let isFood = false;

        try {
          isFood =
            await checkImage(
              image
            );
        } catch (error) {
          console.error(
            "❌ Image AI check failed:",
            error.message
          );
        }

        if (!isFood) {
          await deleteMessage(
            message,
            isGif
              ? "GIF"
              : "IMAGE",
            `AI determined that the ${
              isGif
                ? "GIF"
                : "image"
            } is not food`
          );

          return;
        }

        console.log(
          `✅ AI APPROVED — FOOD ${
            isGif
              ? "GIF"
              : "IMAGE"
          }`
        );

        const originalId =
          message.id;

        await message.delete();

        const reposted =
          await message.channel.send({
            content:
              "Kain Po Tayo Team Ryzza 🍽️",
            files: [
              image.url
            ]
          });

        section(
          `✅ FOOD ${
            isGif
              ? "GIF"
              : "IMAGE"
          } APPROVED`
        );

        console.log(
          `Original: ${originalId}`
        );

        console.log(
          `Reposted: ${reposted.id}`
        );

        return;
      }

      // ==================================================
      // FALLBACK
      // ==================================================

      await deleteMessage(
        message,
        "UNKNOWN",
        "Unsupported content"
      );

    } catch (error) {

      console.error(
        "❌ MESSAGE HANDLER ERROR:"
      );

      console.error(
        error
      );
    }
  }
);

// ==================================================
// LOGIN
// ==================================================

client.login(
  DISCORD_TOKEN
);
