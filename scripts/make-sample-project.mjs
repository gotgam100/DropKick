import fs from "fs";
import path from "path";

const fountainPath = "samples/long-100p.fountain";
const fountainContent = fs.readFileSync(fountainPath, "utf8");

// Parse scenes
const lines = fountainContent.split("\n");
const scenes = [];
let curNum = 0;
let curHeading = "";
let curLines = [];

for (const line of lines) {
  const m = line.match(/^\.(.+?)\s*#(\d+)#/);
  if (m) {
    if (curNum > 0) {
      scenes.push({
        num: curNum,
        heading: curHeading.replace(/^S#\d+\.\s*/, "").trim(),
        snippet: curLines.join(" ").replace(/\s+/g, " ").trim().slice(0, 60),
      });
    }
    curNum = parseInt(m[2], 10);
    curHeading = m[1].trim();
    curLines = [];
  } else if (line.trim() && !line.startsWith("@") && !line.startsWith("(") && !line.startsWith(">")) {
    curLines.push(line.trim());
  }
}
if (curNum > 0) {
  scenes.push({
    num: curNum,
    heading: curHeading.replace(/^S#\d+\.\s*/, "").trim(),
    snippet: curLines.join(" ").replace(/\s+/g, " ").trim().slice(0, 60),
  });
}

function getRef(num) {
  const s = scenes.find((x) => x.num === num);
  if (!s) {
    return {
      key: "sref-" + Math.random().toString(36).slice(2, 8),
      sceneNumber: num,
      heading: "내부. 체육관 - 낮",
      snippet: "",
    };
  }
  return {
    key: "sref-" + Math.random().toString(36).slice(2, 8),
    sceneNumber: s.num,
    heading: s.heading,
    snippet: s.snippet,
  };
}

const targetDir = "samples/드롭킥 (예시).dropkick";
fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });
fs.mkdirSync(path.join(targetDir, "개요"), { recursive: true });
fs.mkdirSync(path.join(targetDir, "인물 설정"), { recursive: true });
fs.mkdirSync(path.join(targetDir, "메모"), { recursive: true });
fs.mkdirSync(path.join(targetDir, "기타"), { recursive: true });

// Copy script
fs.writeFileSync(path.join(targetDir, "스크립트.fountain"), fountainContent, "utf8");

// 3막 구조 (세이브 더 캣)
const beatsData = {
  format: "dropkick-structure",
  version: 1,
  template: "save-the-cat",
  beats: [
    {
      id: "opening-image",
      act: 1,
      title: "오프닝 이미지",
      defaultTitle: "오프닝 이미지",
      guide: "영화의 첫인상이자 변화 전 주인공의 현재 상태를 보여주는 장면",
      synopsis:
        "창밖으로 버스가 지나가는 낡은 포장마차. 은비가 대관료와 적자 장부를 정리하고, 관장과 민재는 말없이 손목에 붕대를 감는다. 해체 직전의 언더그라운드 프로레슬링 구단의 쓸쓸하고 정체된 현재.",
      scenes: [getRef(1), getRef(2)],
    },
    {
      id: "theme-stated",
      act: 1,
      title: "주제 제시",
      defaultTitle: "주제 제시",
      guide: "영화 전체를 관통하는 주제(핵심 질문)가 대화나 상황으로 처음 언급되는 순간",
      synopsis:
        '"민재야, 넌 링을 떠날 수는 있어도 링이 널 놔주진 않아." 관장의 한마디. 프로레슬링은 화려한 쇼가 아니라, 바닥에 내동댕이쳐져도 다시 일어서는 사람들의 삶 그 자체라는 본질을 상기시킨다.',
      scenes: [getRef(3)],
    },
    {
      id: "set-up",
      act: 1,
      title: "설정",
      defaultTitle: "설정",
      guide: "주인공의 일상과 결핍, 주변 인물, 목표를 소개하는 구간",
      synopsis:
        "거울 앞에서 홀로 드롭킥 연습을 하는 열정적인 신인 수아. 낡은 체육관에서 묵묵히 땀 흘리는 민재와 대조적으로, 체육관을 떠나 메이저 단체로 이적해 승승장구하는 라이벌 태식의 소식이 들려온다.",
      scenes: [getRef(4), getRef(5), getRef(6)],
    },
    {
      id: "catalyst",
      act: 1,
      title: "기폭제",
      defaultTitle: "기폭제",
      guide: "주인공의 일상을 뒤흔들고 사건을 시작하게 만드는 결정적 사건",
      synopsis:
        "방송국 지현 PD가 찾아와 시청률 반등을 위한 특별 매치와 TV 중계 리허설을 제안한다. 일본 단체 선수와의 타이틀 매치가 성사되며, 체육관의 존폐를 건 마지막 기회가 찾아온다.",
      scenes: [getRef(7), getRef(12)],
    },
    {
      id: "debate",
      act: 1,
      title: "토론(구성점1)",
      defaultTitle: "토론(구성점1)",
      guide: "새로운 세계(모험)로 나아갈지 망설이고 갈등하는 구간",
      synopsis:
        "민재의 고질적인 무릎 부상과 과연 흥미 위주의 방송 쇼에 들러리를 서야 하는가에 대한 갈등. 은비는 밀린 체육관 임대료를 위해서라도 뛰어야 한다고 설득하고, 선수들은 깊은 고뇌에 빠진다.",
      scenes: [getRef(14), getRef(18)],
    },
    {
      id: "break-into-two",
      act: 2,
      title: "2막 진입",
      defaultTitle: "2막 진입",
      guide: "주인공이 스스로 선택하여 이전 세계를 떠나 본격적인 이야기로 뛰어드는 순간",
      synopsis:
        "심야의 체육관 사무실. 민재는 링에 올라 자신의 마지막 승부를 걸기로 결심한다. 관장은 특훈을 선언하고, 선수들은 물러설 수 없는 실전 훈련의 세계로 뛰어든다.",
      scenes: [getRef(20), getRef(21)],
    },
    {
      id: "b-story",
      act: 2,
      title: "B 스토리",
      defaultTitle: "B 스토리",
      guide: "주제를 일깨워 줄 새로운 인물(조력자·연인·관계)이나 서브 플롯이 시작되는 지점",
      synopsis:
        "부상으로 병원을 찾은 민재와 연습 중 발목을 삔 수아. 옥상과 병원 대기실에서 대화를 나누며, 세대를 뛰어넘은 사제 간의 진솔한 유대감과 믿음이 싹트기 시작한다.",
      scenes: [getRef(23), getRef(25)],
    },
    {
      id: "fun-and-games",
      act: 2,
      title: "재미와 놀라움",
      defaultTitle: "재미와 놀라움",
      guide: "이 영화만의 고유한 재미와 콘셉트가 마음껏 펼쳐지는 구간",
      synopsis:
        "한강 둔치와 옥상을 오가며 펼쳐지는 기상천외한 특훈. 수아의 공중 점프 드롭킥과 민재의 클래식 레슬링 기술이 결합되고, 은비가 SNS에 올린 훈련 영상이 바이럴을 타며 티켓이 팔려나간다.",
      scenes: [getRef(28), getRef(40)],
    },
    {
      id: "midpoint",
      act: 2,
      title: "중간점",
      defaultTitle: "중간점",
      guide: "가짜 승리 혹은 가짜 패배. 판돈(위험)이 커지고 목표가 명확해지는 지점",
      synopsis:
        "티켓 142장 판매 돌파 및 관중들의 환호 속에 치러진 미니 쇼케이스. 모두가 체육관이 살아날 수 있다는 희망에 부풀고, 승리의 예감이 가득 차오른다.",
      scenes: [getRef(54), getRef(56)],
    },
    {
      id: "bad-guys-close-in",
      act: 2,
      title: "악당이 다가오다",
      defaultTitle: "악당이 다가오다",
      guide: "외부의 적대 세력이 강해지고 주인공 팀 내부에서도 균열·의심이 커지는 구간",
      synopsis:
        "방송국 지현 PD가 시청률을 위해 악역 연출과 일방적인 패배 각본을 강요한다. 메이저로 간 태식이 도발하고, 무리한 훈련으로 민재의 무릎 인대가 한계에 도달하며 팀 내에 불화가 생긴다.",
      scenes: [getRef(60), getRef(68)],
    },
    {
      id: "all-is-lost",
      act: 2,
      title: "절망의 순간",
      defaultTitle: "절망의 순간",
      guide: "모든 것을 잃은 것 같은 가짜 패배의 순간. 스승의 부재나 가장 큰 좌절",
      synopsis:
        "리허설 도중 무릎이 꺾여 쓰러지는 민재. 메인 스폰서는 방송 취소를 통보하고, 체육관에는 압류 딱지가 붙는다. 이제 정말 모든 것이 끝난 것처럼 보인다.",
      scenes: [getRef(78), getRef(80)],
    },
    {
      id: "dark-night-of-the-soul",
      act: 2,
      title: "영혼의 어두운 밤(구성점2)",
      defaultTitle: "영혼의 어두운 밤(구성점2)",
      guide: "좌절 끝에 진정한 깨달음(주제)과 해결의 실마리를 스스로 찾아내는 시간",
      synopsis:
        "불 꺼진 링 바닥에 홀로 누운 민재. 수아가 찾아와 포기하지 않겠다고 눈물로 호소한다. 이기는 것이 중요한 게 아니라, 쓰러지더라도 온몸을 던져 진짜 레슬링을 보여주는 것이 자신의 사명임을 깨닫는다.",
      scenes: [getRef(84), getRef(88)],
    },
    {
      id: "break-into-three",
      act: 3,
      title: "3막 진입",
      defaultTitle: "3막 진입",
      guide: "A 스토리와 B 스토리의 깨달음이 합쳐져 마지막 승부를 향해 나아가는 순간",
      synopsis:
        "관장과 은비, 민재, 수아는 방송국의 각본을 집어던지고 진정한 경기를 치르기로 결의한다. 테이핑을 단단히 조여 매고 화려한 조명이 쏟아지는 결전의 경기장으로 걸어 나간다.",
      scenes: [getRef(92), getRef(95)],
    },
    {
      id: "finale",
      act: 3,
      title: "피날레",
      defaultTitle: "피날레",
      guide: "주인공이 변화된 모습으로 문제를 해결하고 클라이맥스를 돌파하는 구간",
      synopsis:
        '각본을 넘어선 사투. 상대의 거친 공격을 버텨낸 민재가 길을 터주고, 수아가 탑 로프에 올라선다. 온몸을 던져 허공을 가르는 궁극의 피니시 무브 "드롭킥"이 작렬하며 경기장이 폭발적인 환호성으로 뒤덮인다.',
      scenes: [getRef(100), getRef(104)],
    },
    {
      id: "final-image",
      act: 3,
      title: "마지막 이미지",
      defaultTitle: "마지막 이미지",
      guide: "오프닝 이미지와 대비되며 주인공과 세계가 어떻게 달라졌는지 보여주는 마지막 장면",
      synopsis:
        "오프닝의 쓸쓸했던 한강 둔치. 이제는 수아와 민재, 그리고 새로 찾아온 연습생들이 함께 새벽 러닝을 뛰고 있다. 땀방울 위로 아침 햇살이 비추며 새로운 내일이 시작된다.",
      scenes: [getRef(106), getRef(107)],
    },
  ],
};

fs.writeFileSync(path.join(targetDir, "개요", "3막 구조.beats"), JSON.stringify(beatsData, null, 2), "utf8");

// 시놉시스.md
const synopsisMd = `# 드롭킥 (시놉시스)

## 로그라인
체육관 폐관 위기에 몰린 퇴물 베테랑 레슬러와 악바리 신인 지망생이 방송국의 각본 매치에 맞서 자신들만의 진짜 '드롭킥'을 날리는 언더독 휴먼 드라마.

## 기획 배경
한국 프로레슬링의 쇠락 속에서도 묵묵히 링을 지키는 사람들의 이야기입니다. 거짓으로 짜인 각본이 가득한 세상 속에서, 자신의 몸을 내던져 정직하게 바닥에 부딪치는 프로레슬링의 진정성을 통해 다시 일어서는 삶의 용기를 전하고자 합니다.

## 줄거리 요약
서울 변두리, 적자 누적으로 문을 닫기 일보 직전인 '청춘 체육관'.
한때 간판스타였지만 부상과 나이로 쇠락한 베테랑 **민재**는 링을 떠나지 못해 손목에 붕대만 감고 있다.
어느 날, 무작정 프로레슬러가 되겠다며 찾아온 악바리 청년 **수아**가 체육관의 문을 두드린다.

체육관 총괄 매니저 **은비**는 밀린 대관료를 갚기 위해 케이블 방송국 **지현 PD**가 기획한 한일 대항전 이벤트 매치 출전을 수락한다. 하지만 방송국이 요구한 것은 신예의 들러리 역할과 굴욕적인 패배 각본이었다.

체육관을 살리기 위해 치욕을 감수하고 훈련에 돌입하는 두 사람.
함께 땀을 흘리며 민재는 수아의 순수한 열정에서 잊고 있던 청춘의 불꽃을 다시 발견하고, 둘은 함께 공중기 '드롭킥'을 완성해 간다.

그러나 리허설 도중 민재의 무릎 부상이 재발하고 스폰서마저 등을 돌리며 모든 것이 무너진다.
절망의 끝에서 두 사람은 거짓 각본대로 지는 대신, 관중들에게 진짜 레슬링을 보여주기로 결심하고 마지막 링 위로 올라서는데...
`;
fs.writeFileSync(path.join(targetDir, "개요", "시놉시스.md"), synopsisMd, "utf8");

// Characters
const characters = [
  {
    name: "민재",
    body: `# 민재

## 기본 정보
- 나이: 36세
- 성별: 남
- 직업: 프로레슬러 (청춘 체육관 최고참)
- 외모: 다부진 어깨와 상처 입은 무릎, 무표정한 얼굴 뒤에 쓸쓸함이 묻어남

## 성격
- 성격: 과묵하고 감정 표현이 서툴지만, 링과 동료에 대한 책임감이 깊다.
- 말투: 단답형. 툭툭 내뱉는 말투지만 속정 깊은 츤데레.
- 습관·버릇: 긴장하거나 생각에 잠길 때 손목의 붕대를 감았다 풀기를 반복한다.

## 이야기 속 역할
- 원하는 것 (목표): 체육관을 지키고, 스스로에게 부끄럽지 않은 마지막 은퇴 경기 치르기
- 필요한 것 (결핍): 과거 부상으로 인해 잃어버린 자신감과 승리를 향한 뜨거운 열정의 회복
- 두려워하는 것: 링 위에서 아무것도 증명하지 못한 채 초라하게 잊히는 것
- 비밀: 의사로부터 무릎 인대 파열로 이번 경기가 끝나면 걷지 못할 수도 있다는 경고를 받음

## 관계
- 관장: 20년 전 길거리 방황하던 자신을 거두어 준 스승이자 아버지 같은 존재
- 수아: 무모하지만 순수한 열정으로 자신의 심장을 다시 뛰게 만든 제자이자 동반자
- 은비: 체육관을 지키기 위해 고생하는 동생 같아 늘 미안함을 느낌
- 태식: 체육관을 떠나 스타가 된 후배. 질투와 안타까움이 교차하는 라이벌

## 변화 (아크)
- 처음: 부상과 생활고에 찌들어 패배주의에 젖어 있던 퇴물 레슬러
- 끝: 승패를 초월하여 자신의 온몸을 던져 관중들에게 감동을 주는 진정한 챔피언
`,
  },
  {
    name: "수아",
    body: `# 수아

## 기본 정보
- 나이: 23세
- 성별: 여
- 직업: 프로레슬러 지망생 (낮에는 카페 아르바이트)
- 외모: 맑은 눈빛, 날렵한 체구, 멍투성이 정강이와 반창고

## 성격
- 성격: 밝고 저돌적이며 절대 뒤돌아보지 않는 직진형 성격
- 말투: 씩씩하고 낭랑함. 항상 말 끝에 에너지가 실려 있음.
- 습관·버릇: 틈만 나면 거울 앞에서 드롭킥 도약 자세를 취해본다.

## 이야기 속 역할
- 원하는 것 (목표): 정식 프로 무대에 데뷔하여 완벽한 드롭킥을 성공시키는 것
- 필요한 것 (결핍): 기술적 완성도와 타인과 호흡을 맞추는 법
- 두려워하는 것: 링에 서보지도 못하고 현실의 벽에 부딪혀 꿈을 포기하는 것
- 비밀: 부모님 몰래 휴학하고 체육관에 다니고 있어 매일 밤 죄책감에 시달린다

## 관계
- 민재: 가장 닮고 싶고 뛰어넘고 싶은 영웅이자 멘토
- 은비: 현실적인 조언과 따뜻한 밥을 챙겨주는 친언니 같은 존재
- 관장: 묵묵히 자신의 가능성을 믿어주는 든든한 어른
`,
  },
  {
    name: "은비",
    body: `# 은비

## 기본 정보
- 나이: 31세
- 성별: 여
- 직업: 청춘 체육관 총괄 매니저 및 프로모터
- 외모: 안경, 헐렁한 재킷, 늘 노트북과 서류 가방을 품에 안고 다님

## 성격
- 성격: 빈틈없고 계산이 빠르며 현실적이지만, 정이 많아 모질지 못하다.
- 말투: 빠르고 또박또박한 비즈니스 말투. 가끔 감정이 격해지면 사투리가 튀어나옴.
- 습관·버릇: 불안할 때 안경을 올리거나 엑셀 장부를 새로고침한다.

## 이야기 속 역할
- 원하는 것 (목표): 체육관의 빚을 청산하고 안정적인 정기 대회를 개최하는 것
- 필요한 것 (결핍): 비즈니스 계산 너머에 있는 사람과 낭만에 대한 신뢰
- 두려워하는 것: 체육관이 파산하여 팀원들이 뿔뿔이 흩어지는 것
`,
  },
  {
    name: "태식",
    body: `# 태식

## 기본 정보
- 나이: 28세
- 성별: 남
- 직업: 메이저 프로레슬링 단체 소속 챔피언
- 외모: 화려한 금발, 값비싼 트레이닝복, 탄탄한 근육질

## 성격
- 성격: 자신만만하고 쇼맨십이 뛰어나며 현실의 승리만을 좇는다.
- 말투: 능글맞고 여유로우며 상대를 자극하는 도발적인 어조.

## 이야기 속 역할
- 이야기 속 역할: 체육관을 떠나 성공한 주인공의 안티테제. 링 위에서 민재와 대립하며 진짜 강함이 무엇인지 묻는다.
`,
  },
  {
    name: "관장",
    body: `# 관장

## 기본 정보
- 나이: 58세
- 성별: 남
- 직업: 청춘 프로레슬링 체육관 관장
- 외모: 백발이 성성한 스포츠머리, 투박한 손, 낡은 트레이닝복

## 성격
- 성격: 묵직한 거목 같은 인물. 칭찬도 꾸중도 적지만 눈빛만으로 무게를 전한다.
- 말투: 낮고 굵은 저음. 말끝을 흐리지 않는다.
- 습관·버릇: 낡은 초시계를 만지작거리며 링 주변을 서성인다.

## 이야기 속 역할
- 이야기 속 역할: 레슬링의 전통과 철학을 전수하는 스승이자 아버지 같은 존재.
`,
  },
  {
    name: "지현",
    body: `# 지현

## 기본 정보
- 나이: 33세
- 성별: 여
- 직업: 케이블 스포츠 채널 메인 연출 PD
- 외모: 깔끔한 슬랙스에 스니커즈, 무전기와 큐시트를 손에서 놓지 않음

## 성격
- 성격: 프로페셔널하고 냉철함. 결과와 숫자로 증명하려는 성향.
- 이야기 속 역할: 시청률을 위해 각본 매치를 요구하지만, 점차 청춘 체육관 사람들의 순수한 진심에 감화되는 관찰자.
`,
  },
];

for (const c of characters) {
  fs.writeFileSync(path.join(targetDir, "인물 설정", c.name + ".md"), c.body, "utf8");
}

// Memos
const memos = [
  {
    name: "기획 의도",
    body: `# 기획 의도

## "넘어져도 다시 일어나는 낭만의 스포츠, 프로레슬링"

한국에서 프로레슬링은 한때 국민 스포츠였으나, 이제는 극소수의 매니아들만이 찾는 비주류 문화로 밀려났습니다.
하지만 화려한 CG나 가상 세계가 넘쳐나는 오늘날, 자신의 생살을 차가운 매트에 내던지며 온몸으로 관객과 호흡하는 프로레슬링만큼 원초적인 인간 승리의 드라마는 없습니다.

이 작품은 인생의 내리막길에 선 퇴물 레슬러와, 출발선조차 서지 못해 헤매는 청춘이 링이라는 좁은 사각의 캔버스 위에서 서로의 상처를 보듬고 다시 비상하는 과정을 그립니다.

모두가 "어차피 짜고 치는 쇼 아니냐"고 묻는 차가운 현실 속에서,
**"짜고 치는 건 각본이지만, 링 바닥에 부딪히는 고통과 흘리는 땀은 100% 진짜다"**라는 진심을 증명하고자 합니다.
`,
  },
  {
    name: "세계관 및 무대 설정",
    body: `# 세계관 및 무대 설정

## 주요 무대

### 1. 청춘 체육관 (지하 1층)
- 90년대 프로레슬링 부흥기 때 지어진 오랜 역사의 체육관.
- 삐걱거리는 나무 바닥, 가죽이 찢어진 샌드백, 테이프로 덕지덕지 감은 로프.
- 환풍기가 돌아갈 때마다 녹슨 소리가 나지만, 역대 선배 챔피언들의 빛바랜 사진들이 벽면을 지키고 있어 묘한 숭고함을 준다.

### 2. 한강 둔치 (새벽 훈련 장소)
- 안개가 자욱한 새벽 5시의 강변.
- 가로등 불빛 아래에서 계단 뛰기와 섀도우 레슬링을 하는 선수들의 실루엣.
- 강 건너 화려한 빌딩 숲과 대비되는 주인공들의 헝그리 정신을 시각화.

### 3. 방송국 특설 링 (클라이맥스 무대)
- 최신식 LED 전광판, 화려한 스모그, 수많은 방송 카메라가 둘러싼 메이저 무대.
- 체육관의 낡은 링과는 전혀 다른 위압감을 주며, 두 주인공이 돌파해야 할 냉혹한 상업주의를 상징.
`,
  },
  {
    name: "기술 및 경기 규칙 메모",
    body: `# 기술 및 경기 규칙 메모

## 핵심 시그니처 무브: 드롭킥 (Dropkick)
- **기술 설명**: 두 발을 모아 수평으로 도약하여 상대방의 가슴이나 턱을 강타하는 프로레슬링의 대표적인 공중 타격기.
- **작품 내 상징성**:
  - 상대에게 타격을 주기 위해 공중에 몸을 띄우는 순간, 시전자의 몸 역시 무방비 상태로 등부터 매트에 격돌하게 된다.
  - 즉, 상대를 쓰러뜨리기 위해 자신의 몸도 바닥에 던져야 하는 '자기희생과 용기'의 상징.

## 경기 규칙 메모
- 핀폴(Pinfall): 상대의 두 어깨를 매트에 붙이고 심판의 3카운트를 얻어내면 승리.
- 서브미션(Submission): 관절기를 통해 기권을 받아내는 승리.
- 장외 카운트(Ring Out): 링 밖으로 나간 뒤 20카운트(한국 룰) 안에 링으로 복귀하지 못하면 패배.
`,
  },
];

for (const m of memos) {
  fs.writeFileSync(path.join(targetDir, "메모", m.name + ".md"), m.body, "utf8");
}

// Etc memo
const etcMd = `# 참고 링크 및 자료

- [한국 프로레슬링 연맹 히스토리](https://example.com)
- [블레이크 스나이더 저, 세이브 더 캣 15단계 분석 노트](https://example.com)
- 주요 참고 영화: <더 레슬러(The Wrestler)>, <반칙왕>, <파이팅 위드 마이 패밀리>
`;
fs.writeFileSync(path.join(targetDir, "기타", "참고 링크 및 자료.md"), etcMd, "utf8");

// project.json
const manifest = {
  format: "dropkick-project",
  version: 1,
  title: "드롭킥 (예시)",
  mainScript: "script-main",
  tree: [
    {
      id: "folder-outline",
      type: "folder",
      name: "개요",
      icon: "book",
      children: [
        {
          id: "doc-synopsis",
          type: "synopsis",
          name: "시놉시스",
          file: "개요/시놉시스.md",
          icon: "doc.text",
        },
        {
          id: "doc-structure",
          type: "structure",
          name: "3막 구조 (세이브 더 캣)",
          file: "개요/3막 구조.beats",
          icon: "square.grid.3x3",
        },
      ],
    },
    {
      id: "script-main",
      type: "script",
      name: "스크립트",
      file: "스크립트.fountain",
      icon: "film",
    },
    {
      id: "folder-chars",
      type: "folder",
      name: "인물 설정",
      icon: "person.2",
      children: characters.map((c) => ({
        id: "char-" + c.name,
        type: "character",
        name: c.name,
        file: "인물 설정/" + c.name + ".md",
        icon: "person",
      })),
    },
    {
      id: "folder-notes",
      type: "folder",
      name: "메모",
      icon: "note.text",
      children: memos.map((m) => ({
        id: "memo-" + m.name,
        type: "memo",
        name: m.name,
        file: "메모/" + m.name + ".md",
        icon: "doc.text",
      })),
    },
    {
      id: "folder-etc",
      type: "folder",
      name: "기타",
      icon: "folder",
      children: [
        {
          id: "memo-links",
          type: "memo",
          name: "참고 링크 및 자료",
          file: "기타/참고 링크 및 자료.md",
          icon: "doc.text",
        },
      ],
    },
  ],
  lastOpened: "script-main",
};

fs.writeFileSync(path.join(targetDir, "project.json"), JSON.stringify(manifest, null, 2), "utf8");

console.log("Successfully generated:", targetDir);
