<?php
// 程序基本信息
const PROGRAM_NAME = "Quick Translate Bot (PHP)";
const PROGRAM_VERSION = "1.0.1";

// 处理 HTTP 请求
function handleRequest() {
    try {
        return handleTelegramWebhook();
    } catch (Exception $e) {
        error_log("Error: " . $e->getMessage());
        http_response_code(500);
        return;
    }
}

// 处理 Telegram 更新消息
function handleTelegramWebhook() {
    $secretBotToken = "";
    $maxTimeDifference = 20;
    $isGroupFeatureEnabled = false;
    $telegramBotUsername = "";
    $telegramBotToken = "";

    try {
        // 验证 Telegram 的 Secret Token
        $receivedToken = $_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] ?? '';
        if ($receivedToken !== $secretBotToken) {
            http_response_code(403);
            return;
        }

        $updateData = json_decode(file_get_contents('php://input'), true);
        $message = $updateData['message'] ?? $updateData['edited_message'] ?? null;

        if (!$message) {
            http_response_code(200);
            return;
        }

        $messageText = $message['text'] ?? null;
        $chat = $message['chat'];
        $messageId = $message['message_id'];
        $from = $message['from'];
        $entities = $message['entities'] ?? [];
        $date = $message['date'];
        $replyToMessage = $message['reply_to_message'] ?? null;
        $chatId = $chat['id'];
        $chatType = $chat['type'];
        $userId = $from['id'];
        $username = $from['username'] ?? "Unknown";

        // 计算时间戳
        $currentTimestamp = time();
        $timeDifference = abs($currentTimestamp - $date);

        // 检查信息时间与服务器时间的差值
        if ($timeDifference > $maxTimeDifference) {
            error_log("Time difference $timeDifference seconds is greater than $maxTimeDifference");
            http_response_code(200);
            return;
        }

        // 检查聊天类型是否不为私聊
        if ($chatType !== "private") {
            // 检查是否在群组中提及了机器人
            if ($isGroupFeatureEnabled && $telegramBotUsername && $messageText && $entities) {
                $isBotMentioned = false;
                foreach ($entities as $entity) {
                    if ($entity['type'] === 'mention') {
                        $mention = substr($messageText, $entity['offset'], $entity['length']);
                        if ($mention === "@$telegramBotUsername") {
                            $isBotMentioned = true;
                            break;
                        }
                    }
                }

                if ($isBotMentioned) {
                    $mentionOffset = 0;
                    foreach ($entities as $entity) {
                        if ($entity['type'] === 'mention' && substr($messageText, $entity['offset'], $entity['length']) === "@$telegramBotUsername") {
                            $mentionOffset = $entity['offset'] + strlen("@$telegramBotUsername");
                            break;
                        }
                    }
                    $userMessageText = trim(substr($messageText, $mentionOffset));

                    // 如果@后面没有文本并且不是引用，则发送提示信息
                    if (empty($userMessageText) && !$replyToMessage) {
                        sendTelegramMessage($chatId, "您好，欢迎提及 " . PROGRAM_NAME . "！\n请在提及后面输入您需要翻译的文本。", $messageId, $telegramBotToken);
                        return;
                    }

                    // 处理报告命令
                    if ($userMessageText === "/report") {
                        $serverTime = date('c');
                        $reportText = "程序名：" . PROGRAM_NAME . "\n版本：" . PROGRAM_VERSION . "\n服务器时间：" . $serverTime . "\n\n用户名：@" . $username . "\n用户ID：" . $userId . "\n聊天ID：" . $chatId . "\n聊天类型：" . $chatType . "\n\n作者：molikai-work\nGitHub：https://github.com/molikai-work/QuickTranslateBot";
                        sendTelegramMessage($chatId, $reportText, $messageId, $telegramBotToken);
                        return;
                    }

                    // 处理群组消息
                    handleGroupMessageTranslation($userMessageText, $chatId, $messageId, $telegramBotToken, $replyToMessage);
                    return;
                }
            }

            // 如果不是私聊，且群组功能没有启用或没有@bot，直接忽略处理
            http_response_code(200);
            return;
        }

        // 处理贴纸消息
        if (isset($message['sticker'])) {
            sendTelegramSticker($chatId, $message['sticker']['file_id'], $messageId, $telegramBotToken);
            return;
        }

        // 处理图片、视频、文件等其他媒体类型
        if (isset($message['photo']) || isset($message['document']) || isset($message['video']) || isset($message['audio']) || isset($message['voice'])) {
            sendTelegramMessage($chatId, "抱歉，目前我不支持处理图片、视频、音频或文件等媒体类型。只支持对文本进行翻译。", $messageId, $telegramBotToken);
            return;
        }

        // 如果没有 messageText
        if (!$messageText) {
            sendTelegramMessage($chatId, "请发送您需要翻译的文本。", $messageId, $telegramBotToken);
            return;
        }

        // 处理开始命令
        if ($messageText === "/start") {
            $startText = "好！让我们开始翻译，谢谢使用 " . PROGRAM_NAME . " v" . PROGRAM_VERSION . "！\n请您直接的将要翻译的文本发送给我，目前仅支持中英互译，我会自动识别并回复翻译结果。\n\n您也可以使用 /to <目标语言> <文本> 命令快捷指定目标语言进行翻译。\n使用 /translate <源语言> <目标语言> <文本> 命令指定源语言与目标语言进行翻译。\n\n使用 /report 查看程序详细信息。";
            sendTelegramMessage($chatId, $startText, $messageId, $telegramBotToken);
            return;
        }

        // 处理报告命令
        if ($messageText === "/report") {
            $serverTime = date('c');
            $reportText = "程序名：" . PROGRAM_NAME . "\n版本：" . PROGRAM_VERSION . "\n服务器时间：" . $serverTime . "\n\n用户名：@" . $username . "\n用户ID：" . $userId . "\n聊天类型：" . $chatType . "\n\n作者：molikai-work\nGitHub：https://github.com/molikai-work/QuickTranslateBot";
            sendTelegramMessage($chatId, $reportText, $messageId, $telegramBotToken);
            return;
        }

        // 处理 /from 命令
        if (preg_match('/^\/from\s+([a-zA-Z-]+)\s+([\s\S]+)/', $messageText, $matches)) {
            $sourceLang = $matches[1];
            $userMessageText = $matches[2];
            $translatedText = fetchTranslation($userMessageText, $sourceLang, 'zh-CN');
            sendTelegramMessage($chatId, $translatedText, $messageId, $telegramBotToken);
            return;
        }

        // 处理 /to 命令
        if (preg_match('/^\/to\s+([a-zA-Z-]+)\s+([\s\S]+)/', $messageText, $matches)) {
            $targetLang = $matches[1];
            $userMessageText = $matches[2];
            $translatedText = fetchTranslation($userMessageText, 'auto', $targetLang);
            sendTelegramMessage($chatId, $translatedText, $messageId, $telegramBotToken);
            return;
        }

        // 处理 /translate 命令
        if (preg_match('/^\/translate\s+([a-zA-Z-]+)\s+([a-zA-Z-]+)\s+([\s\S]+)/', $messageText, $matches)) {
            $sourceLang = $matches[1];
            $targetLang = $matches[2];
            $userMessageText = $matches[3];
            $translatedText = fetchTranslation($userMessageText, $sourceLang, $targetLang);
            sendTelegramMessage($chatId, $translatedText, $messageId, $telegramBotToken);
            return;
        }

        // 处理翻译请求
        $translatedText = fetchTranslation($messageText);
        sendTelegramMessage($chatId, $translatedText, $messageId, $telegramBotToken);
    } catch (Exception $e) {
        error_log("Error: " . $e->getMessage());
        http_response_code(500);
    }
}

// 处理群组消息
function handleGroupMessageTranslation($messageText, $chatId, $messageId, $telegramBotToken, $replyToMessage) {
    $trimmedMessageText = trim($messageText);

    // 检查是否是引用消息且提及后没有文本
    if ($replyToMessage && empty($trimmedMessageText)) {
        $originalMessageText = $replyToMessage['text'] ?? null;
        if ($originalMessageText) {
            // 对引用的消息进行翻译
            $translatedText = fetchTranslation($originalMessageText);
            sendTelegramMessage($chatId, $translatedText, $messageId, $telegramBotToken);
        } else {
            sendTelegramMessage($chatId, "抱歉，引用的消息不包含可翻译的文本。", $messageId, $telegramBotToken);
        }
        return;
    }

    // 如果不是引用消息或者提及后有文本，直接处理文本翻译
    $translatedText = fetchTranslation($messageText);
    sendTelegramMessage($chatId, $translatedText, $messageId, $telegramBotToken);
}

// 处理翻译请求
function fetchTranslation($text, $sourceLang = null, $targetLang = null) {
    $googleTranslateApiUrl = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=";

    // 如果没有指定源语言和目标语言，默认进行中英文互译
    if (!$sourceLang || !$targetLang) {
        // 根据消息内容判断目标语言（如果是中文则翻译成英文，反之亦然）
        $sourceLang = preg_match('/[\p{Han}]/u', trim($text)) ? "zh-CN" : "en";
        $targetLang = $sourceLang === "zh-CN" ? "en" : "zh-CN";
    }

    $translateUrl = $googleTranslateApiUrl . $sourceLang . "&tl=" . $targetLang . "&dt=t&q=" . urlencode($text);

    try {
        $translateResponse = file_get_contents($translateUrl);
        if ($translateResponse === false) {
            throw new Exception("Failed to fetch translation");
        }

        $translateData = json_decode($translateResponse, true);
        $translatedText = "";
        foreach ($translateData[0] as $item) {
            $translatedText .= $item[0];
        }
        return $translatedText;
    } catch (Exception $e) {
        error_log("Error: " . $e->getMessage());
        return "抱歉，第三方翻译服务不可达，请稍后再试。";
    }
}

// 发送文本消息
function sendTelegramMessage($chatId, $text, $replyToMessageId, $token) {
    try {
        $sendMessageUrl = "https://api.telegram.org/bot" . $token . "/sendMessage";
        $messagePayload = [
            'chat_id' => $chatId,
            'text' => $text,
            'reply_to_message_id' => $replyToMessageId,
            'disable_web_page_preview' => "true",
        ];

        $options = [
            'http' => [
                'method' => 'POST',
                'header' => 'Content-Type: application/json',
                'content' => json_encode($messagePayload),
            ],
        ];
        $context = stream_context_create($options);
        file_get_contents($sendMessageUrl, false, $context);

        http_response_code(200);
    } catch (Exception $e) {
        error_log("Error: " . $e->getMessage());
        http_response_code(500);
    }
}

// 发送贴纸消息
function sendTelegramSticker($chatId, $stickerId, $replyToMessageId, $token) {
    try {
        $sendStickerUrl = "https://api.telegram.org/bot" . $token . "/sendSticker";
        $stickerPayload = [
            'chat_id' => $chatId,
            'sticker' => $stickerId,
            'reply_to_message_id' => $replyToMessageId,
        ];

        $options = [
            'http' => [
                'method' => 'POST',
                'header' => 'Content-Type: application/json',
                'content' => json_encode($stickerPayload),
            ],
        ];
        $context = stream_context_create($options);
        file_get_contents($sendStickerUrl, false, $context);

        http_response_code(200);
    } catch (Exception $e) {
        error_log("Error: " . $e->getMessage());
        http_response_code(500);
    }
}

// 执行请求处理
handleRequest();
