import * as AWS from "aws-sdk";
import * as line from "@line/bot-sdk";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import ja from "dayjs/locale/ja";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale(ja);
const YYYYMMDDdd_FORMAT = "YYYY年MM月DD日(ddd)";

const ssm = new AWS.SSM();

const validInputDateType = ['today', 'tomorrow'] as const;
type dateType = typeof validInputDateType[number];

// SSM ParameterStoreから値を取得する
const getSSMParameter = async (name: string) => {
  const request = {
    Name: name,
    WithDecryption: true
  };

  const response = await ssm.getParameter(request).promise();

  return response.Parameter?.Value;
};

// ゴミの日のデータ
const garbageDays = [
  {
    name: '可燃ごみ',
    days: [2, 5]
  },
  {
    name: '缶・びん',
    days: [3],
    weeksOfMonth: [2, 4]
  },
  {
    name: '不燃ごみ',
    days: [3],
    weeksOfMonth: [1, 3, 5]
  },
  {
    name: '乾電池',
    days: [3],
    weeksOfMonth: [1, 3, 5]
  },
  {
    name: '古紙・古布',
    days: [4]
  },
  {
    name: '廃プラ・ペットボトル',
    days: [1]
  }
];

// 指定した日付が月の第何週か計算する
// 例) 2022-09-01(木曜日) -> 1
const getWeekOfMonth = (date: dayjs.Dayjs) => {
  return Math.floor((date.date() - 1) / 7) + 1;
};

// 指定した日付に回収されるゴミの種類を取得する
const getGarbageNames = (date: dayjs.Dayjs) => {
  const weekOfMonth = getWeekOfMonth(date);
  const day = date.day();

  const result = [];

  for (const garbage of garbageDays) {
    if (
      garbage.days.includes(day)
      && (! garbage.weeksOfMonth || garbage.weeksOfMonth.includes(weekOfMonth))
    ) {
      result.push(garbage.name);
    }
  }

  return result;
}

// メッセージを生成
const generateText = (date: dayjs.Dayjs, type: dateType, garbageNames: string[]) => {
  const translation = {
    'today': '今日',
    'tomorrow': '明日'
  }

  return translation[type] + date.format(YYYYMMDDdd_FORMAT) + 'に回収されるゴミは、\n' + garbageNames.map(name => '「' + name + '」').join('と') + 'です！';
}

// LINEに翌日回収されるゴミの種類をリマインドする
export const handler = async (event: any, context: any, callback: any) => {
  if (! event.date || ! validInputDateType.includes(event.date)) return;

  // Amazon EventBridgeで渡されるJSONパラメータ
  const dateType: dateType = event.date;

  // SSMパラメータストアからLINEのアクセスキーを取得
  const LINE_ACCESS_KEY = await getSSMParameter('LINE_ACCESS_KEY');
  const LINE_USER_ID = await getSSMParameter('LINE_USER_ID');

  if (! (LINE_ACCESS_KEY && LINE_USER_ID)) return;

  const client = new line.Client({
    channelAccessToken: LINE_ACCESS_KEY
  });

  let date = dayjs().tz('Asia/Tokyo'); // today
  if (dateType === 'tomorrow') date = date.add(1, 'day');

  const garbageNames = getGarbageNames(date);

  const messages: line.Message[] = [
    {
      type: 'text',
      text: generateText(date, dateType, garbageNames)
    }
  ];

  await client.pushMessage(LINE_USER_ID, messages);
};
