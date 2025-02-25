// 程序基本信息
const programName = "Quick Translate Bot";
const programVersion = "1.1.2";

// 处理 HTTP 请求
export default {
  async fetch(request, env) {
    try {
      const requestUrl = new URL(request.url);
      const { pathname } = requestUrl;

      if (pathname === "/bot/webhook") {
        return await handleTelegramWebhook(request, env);
      }

      return new Response(null, { status: 404 });
    } catch (error) {
      console.error("Error:", error);
      return new Response(null, { status: 500 });
    }
  }
};

// 处理 Telegram 更新消息
async function handleTelegramWebhook(request, env) {
  const secretBotToken = env.SECRET_TOKEN;
  const maxTimeDifference = env.MAX_TIME_DIFF || 20;
  const isGroupFeatureEnabled = env.ENABLE_GROUP_FEATURE || false;
  const telegramBotUsername = env.TELEGRAM_BOT_NAME || null;
  const telegramBotToken = env.TELEGRAM_BOT_TOKEN;

  try {
    // 验证 Telegram 的 Secret Token
    const receivedToken = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (receivedToken !== secretBotToken) {
      return new Response(null, { status: 403 });
    }

    const updateData = await request.json();
    const message = updateData.message || updateData.edited_message;

    if (!message) return new Response(null, { status: 200 });

    const { text: messageText, chat, message_id, from, entities, date, reply_to_message } = message;
    const { id: chatId, type: chatType } = chat;
    const { id: userId, username = "Unknown" } = from;

    // 计算时间戳
    const currentTimestamp = Math.floor(Date.now() / 1000); // 当前服务器时间戳
    const timeDifference = Math.abs(currentTimestamp - date); // 计算时间差

    // 检查信息时间与服务器时间的差值
    if (timeDifference > maxTimeDifference) {
      console.log(`Time difference ${timeDifference} seconds is greater than ${maxTimeDifference}`);
      return new Response(null, { status: 200 });
    }

    // 检查聊天类型是否不为私聊
    if (chatType !== "private") {
      // 检查是否在群组中提及了机器人
      if (isGroupFeatureEnabled && telegramBotUsername && messageText && entities) {
        const isBotMentioned = entities.some(entity =>
          entity.type === 'mention' &&
          messageText.slice(entity.offset, entity.offset + entity.length) === `@${telegramBotUsername}`
        );

        if (isBotMentioned) {
          const userMessageText = messageText.slice(entities.find(e => e.type === 'mention').offset + `@${telegramBotUsername}`.length).trim();

          // 如果@后面没有文本并且不是引用，则发送提示信息
          if (!userMessageText && !reply_to_message) {
            return sendTelegramMessage(chatId, `您好，欢迎提及 ${telegramBotUsername}！\n请在提及后面输入您需要翻译的文本。`, message_id, telegramBotToken);
          }

          // 处理报告命令
          if (userMessageText === "/report") {
            const serverTime = new Date().toISOString();
            return sendTelegramMessage(chatId, `程序名：${programName}\n版本：${programVersion}\n服务器时间：${serverTime}\n\n用户名：@${username}\n用户ID：${userId}\n聊天ID：${chatId}\n聊天类型：${chatType}\n\n作者：molikai-work\nGitHub：https://github.com/molikai-work/QuickTranslateBot`, message_id, telegramBotToken);
          }

          // 处理群组消息
          return await handleGroupMessageTranslation(userMessageText, chatId, message_id, telegramBotToken, reply_to_message);
        }
      }

      // 如果不是私聊，且群组功能没有启用或没有@bot，直接忽略处理
      return new Response(null, { status: 200 });
    }

    // 处理贴纸消息
    if (message.sticker) {
      return sendTelegramSticker(chatId, message.sticker.file_id, message_id, telegramBotToken);
    }

    // 处理图片、视频、文件等其他媒体类型
    if (message.photo || message.document || message.video || message.audio || message.voice) {
      return sendTelegramMessage(chatId, "抱歉，目前我不支持处理图片、视频、音频或文件等媒体类型。只支持对文本进行翻译。", message_id, telegramBotToken);
    }

    // 如果没有 messageText
    if (!messageText) {
      return sendTelegramMessage(chatId, "请发送您需要翻译的文本。", message_id, telegramBotToken);
    }

    // 处理开始命令
    if (messageText === "/start") {
      return sendTelegramMessage(chatId, `好！让我们开始翻译，谢谢使用 ${programName} v${programVersion}！\n请您直接的将要翻译的文本发送给我，目前仅支持中英互译，我会自动识别并回复翻译结果。\n\n您也可以使用 /to <目标语言> <文本> 命令快捷指定目标语言进行翻译。\n使用 /from <源语言> <文本> 命令快捷指定源语言翻译为简体中文。\n使用 /translate <源语言> <目标语言> <文本> 命令指定源语言与目标语言进行翻译。\n\n使用 /report 查看程序详细信息。`, message_id, telegramBotToken);
    }

    // 处理报告命令
    if (messageText === "/report") {
      const serverTime = new Date().toISOString();
      return sendTelegramMessage(chatId, `程序名：${programName}\n版本：${programVersion}\n服务器时间：${serverTime}\n\n用户名：@${username}\n用户ID：${userId}\n聊天类型：${chatType}\n\n作者：molikai-work\nGitHub：https://github.com/molikai-work/QuickTranslateBot`, message_id, telegramBotToken);
    }

    // 处理 /from 命令
    const fromCommandRegex = /^\/from\s+([a-zA-Z-]+)\s+([\s\S]+)/;
    const matchTromCommand = messageText.match(fromCommandRegex);
    if (matchTromCommand) {
      const [_, sourceLang, userMessageText] = matchTromCommand;

      // 设置目标语言为 zh-CN 并根据 sourceLang 设置源语言
      const translatedText = await fetchTranslation(userMessageText, sourceLang, 'zh-CN');
      return sendTelegramMessage(chatId, translatedText, message_id, telegramBotToken);
    }

    // 处理 /to 命令
    const toCommandRegex = /^\/to\s+([a-zA-Z-]+)\s+([\s\S]+)/;
    const matchToCommand = messageText.match(toCommandRegex);
    if (matchToCommand) {
      const [_, targetLang, userMessageText] = matchToCommand;

      // 设置目标语言为 targetLang 并自动检测源语言
      const translatedText = await fetchTranslation(userMessageText, 'auto', targetLang);
      return sendTelegramMessage(chatId, translatedText, message_id, telegramBotToken);
    }

    // 处理 /translate 命令
    const translateCommandRegex = /^\/translate\s+([a-zA-Z-]+)\s+([a-zA-Z-]+)\s+([\s\S]+)/;
    const matchTranslateeCommand = messageText.match(translateCommandRegex);
    if (matchTranslateeCommand) {
      const [_, sourceLang, targetLang, userMessageText] = matchTranslateeCommand;

      // 调用翻译功能，并指定源语言和目标语言
      const translatedText = await fetchTranslation(userMessageText, sourceLang, targetLang);
      return sendTelegramMessage(chatId, translatedText, message_id, telegramBotToken);
    }

    // 处理翻译请求
    const translatedText = await fetchTranslation(messageText);
    return sendTelegramMessage(chatId, translatedText, message_id, telegramBotToken);
  } catch (error) {
    console.error("Error:", error);
    return new Response(null, { status: 500 });
  }
}

// 处理群组消息
async function handleGroupMessageTranslation(messageText, chatId, messageId, telegramBotToken, reply_to_message) {
  const trimmedMessageText = messageText.trim();

  // 检查是否是引用消息且提及后没有文本
  if (reply_to_message && !trimmedMessageText) {
    const originalMessageText = reply_to_message.text;
    if (originalMessageText) {
      // 对引用的消息进行翻译
      const translatedText = await fetchTranslation(originalMessageText);
      return sendTelegramMessage(chatId, translatedText, messageId, telegramBotToken);
    } else {
      return sendTelegramMessage(chatId, "抱歉，引用的消息不包含可翻译的文本。", messageId, telegramBotToken);
    }
  }

  // 如果不是引用消息或者提及后有文本，直接处理文本翻译
  const translatedText = await fetchTranslation(messageText);
  return sendTelegramMessage(chatId, translatedText, messageId, telegramBotToken);
}

// 处理翻译请求
async function fetchTranslation(text, sourceLang = null, targetLang = null) {
  const googleTranslateApiUrl = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=";

  // 如果没有指定源语言和目标语言，默认进行中英文互译
  if (!sourceLang || !targetLang) {
    // 根据消息内容判断目标语言（如果是中文则翻译成英文，反之亦然）
    sourceLang = /[\p{Script=Han}]/u.test(text.trim()) ? "zh-CN" : "en";
    targetLang = sourceLang === "zh-CN" ? "en" : "zh-CN";
  }

  const translateUrl = `${googleTranslateApiUrl}${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;

  try {
    const translateResponse = await fetch(translateUrl);
    if (!translateResponse.ok) throw new Error("Failed to fetch translation");

    const translateData = await translateResponse.json();
    return translateData[0].map(item => item[0]).join(""); // 返回翻译结果
  } catch (error) {
    console.error("Error:", error);
    return "抱歉，第三方翻译服务不可达，请稍后再试。";
  }
}

// 发送文本消息
async function sendTelegramMessage(chatId, text, replyToMessageId, token) {
  try {
    const sendMessageUrl = `https://api.telegram.org/bot${token}/sendMessage`;
    const messagePayload = {
      chat_id: chatId, text,
      reply_to_message_id: replyToMessageId,
      disable_web_page_preview: "true",
    };

    await fetch(sendMessageUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messagePayload)
    });

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("Error:", error);
    return new Response(null, { status: 500 });
  }
}

// 发送贴纸消息
async function sendTelegramSticker(chatId, stickerId, replyToMessageId, token) {
  try {
    const sendStickerUrl = `https://api.telegram.org/bot${token}/sendSticker`;
    const stickerPayload = {
      chat_id: chatId,
      sticker: stickerId,
      reply_to_message_id: replyToMessageId };

    await fetch(sendStickerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(stickerPayload)
    });

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error("Error:", error);
    return new Response(null, { status: 500 });
  }
}
