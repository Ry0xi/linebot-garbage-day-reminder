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
const generateText = (date: dayjs.Dayjs, garbageNames: string[]) => {
  return date.format(YYYYMMDDdd_FORMAT) + 'に回収されるゴミは、\n' + garbageNames.map(name => '「' + name + '」').join('と') + 'です！';
}

// LINEに翌日回収されるゴミの種類をリマインドする
export const handler = async (event: any, context: any, callback: any) => {
  // SSMパラメータストアからLINEのアクセスキーを取得
  const LINE_ACCESS_KEY = await getSSMParameter('LINE_ACCESS_KEY');
  const USER_ID = await getSSMParameter('USER_ID');

  if (! (LINE_ACCESS_KEY && USER_ID)) return;

  const client = new line.Client({
    channelAccessToken: LINE_ACCESS_KEY
  });

  const tomorrow = dayjs().tz('Asia/Tokyo').add(1, 'day');
  const garbageNames = getGarbageNames(tomorrow);

  const messages: line.Message[] = [
    {
      type: 'text',
      text: generateText(tomorrow, garbageNames)
    }
  ];

  await client.pushMessage(USER_ID, messages);
};
