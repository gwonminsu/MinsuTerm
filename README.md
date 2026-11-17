<div align="center">

<img src="build/icon.png" width="96" alt="MinsuTerm icon">

# MinsuTerm

Claude Code와 Codex CLI를 쓰는 사람을 위한 Windows / macOS 터미널

[다운로드](../../releases/latest) · [English](#english) · [후원](#후원)

<img src="docs/media/agent.gif" width="880" alt="Claude Code가 서브에이전트 두 개를 돌리는 동안 사이드바에 작업과 하수인이 표시되고, 끝나면 완료 문구가 뜨는 화면">

</div>

## 만든 이유

터미널에서 `claude`랑 `codex`를 여러 개 띄워 놓고 일하다 보면 어느 탭이 아직 일하는 중인지, 어디서 내 대답을 기다리는지 계속 탭을 넘겨 가며 확인하게 됩니다. 다른 창 보다가 작업이 끝난 걸 한참 뒤에 알기도 하고, 터미널을 껐다 켜면 어제 하던 대화를 다시 찾아야 하고요.

그래서 이런 걸 알아서 챙겨 주는 터미널을 만들었습니다. 평소처럼 cmd, PowerShell, zsh를 쓰다가 `claude`나 `codex`를 실행하면 그 탭이 에이전트 모드로 바뀝니다. 따로 설정할 건 없습니다.

## 주요 기능

**에이전트 작업 현황**
사이드바에서 폴더별로 입력 대기 / 진행 중 / 완료 작업을 볼 수 있습니다. 프롬프트 하나가 작업 하나로 잡히고, 얼마나 걸렸는지도 나옵니다. 에이전트가 서브에이전트를 띄우면 작업 아래에 작은 하수인 캐릭터가 붙어서 같이 일하다가 끝나면 체크 표시를 합니다.

**놓치지 않는 알림**
다른 탭이나 다른 앱을 보고 있어도 작업이 끝나면 알림이 옵니다. 에이전트가 선택지를 물어보면 사이드바에 말풍선이 뜨고 알림도 같이 옵니다.

**세션 복원**
앱을 다시 열면 탭 구성과 Claude / Codex 대화가 그대로 이어집니다. 지난 대화는 검색해서 다시 열 수 있고, 지운 대화는 휴지통에서 되살릴 수 있습니다.

**화면 분할**
탭을 터미널 화면 쪽으로 끌어다 놓으면 바로 분할됩니다. 분할된 창의 머리 부분을 끌어서 위치를 바꾸거나 다시 탭으로 돌려놓을 수 있고, 한 창만 잠깐 크게 볼 수도 있습니다.

<img src="docs/media/split.gif" width="880" alt="탭을 끌어다 놓아 오른쪽과 아래로 분할하고, 창 위치를 바꾸고, 한 창만 크게 보고, 다시 탭으로 되돌리는 화면">

**프롬프트 작성기**
긴 프롬프트는 터미널 입력줄에 바로 치기 불편해서 따로 쓰는 창을 만들었습니다. 하단 상태줄의 작성기 버튼(또는 Ctrl+Shift+E)을 누르면 열립니다. 여러 줄이나 한글도 편하게 쓸 수 있고, 파일을 끌어다 놓으면 경로가 들어갑니다. 다 쓰고 보내면 에이전트에 그대로 전달됩니다. 타이핑 효과와 소리도 여기서 똑같이 나옵니다.

<img src="docs/media/composer.gif" width="880" alt="셸에서 십자선 커서와 폭죽 입력 효과로 명령을 치고 Claude를 실행한 뒤, 작성기에서 여러 줄 프롬프트를 써서 보내면 계주 테두리가 돌다가 완료 문구가 뜨는 화면">

**꾸미기**
오래 보는 화면이라 꾸미는 재미도 넣었습니다. 에이전트가 일하는 동안 테두리를 따라 계주 선수나 산타 썰매가 달리고, 작업이 끝나면 축하 효과와 문구가 뜹니다. 배경 애니메이션, 타이핑 효과와 소리, 다크 / 라이트 테마도 고를 수 있습니다. 전부 설정에서 미리 보면서 고르면 됩니다.

<img src="docs/media/border.gif" width="880" alt="Claude Code가 파일을 읽는 동안 작업 테두리가 계주, 추격전, 기차, 산타 썰매, 개미 행렬로 바뀌고, 이어서 테마와 라이트 모드로 바뀌는 화면">

<img src="docs/media/deco.gif" width="880" alt="셸에서 타이핑하면서 배경과 타이핑 효과를 바꾸는 화면: 뇌우, 블랙홀, 오로라, 눈, 신스웨이브">

**한국어 / English / 日本語 / 中文**
설정에서 언어를 바꾸면 메뉴부터 꾸미기 항목 이름까지 바로 바뀝니다.

## 설치

[Releases](../../releases/latest)에서 받으면 됩니다.

| OS | 파일 |
|---|---|
| Windows 10 / 11 | `MinsuTerm-Setup-x.y.z.exe` |
| macOS (Apple Silicon) | `MinsuTerm-x.y.z-mac-arm64.zip` |
| macOS (Intel) | `MinsuTerm-x.y.z-mac-x64.zip` |

Windows에서 "Windows의 PC 보호" 창이 뜨면 추가 정보 > 실행을 누르면 됩니다.

macOS에서 "손상되었기 때문에 열 수 없습니다"라고 나오면, 아직 Apple 공증을 받지 않아서 그렇습니다. 압축을 푼 폴더에서 터미널을 열고 아래를 실행해 주세요.

```bash
xattr -cr .
bash "MinsuTerm 설치.command"
```

[Claude Code](https://docs.anthropic.com/en/docs/claude-code)나 [Codex CLI](https://github.com/openai/codex)는 따로 설치되어 있어야 합니다.

## 자주 묻는 질문

**Claude Code 쓰기 좋은 터미널을 찾고 있어요.**
그 용도로 만든 앱입니다. 작업 진행 상황, 서브에이전트, 선택 대기를 사이드바에서 보여 주고, 끝나면 알려 주고, 다시 열면 대화를 이어 줍니다.

**Codex CLI도 되나요?**
네. `codex`도 똑같이 인식해서 작업 현황, 서브에이전트, 세션 복원이 됩니다.

**기존 터미널이랑 뭐가 다른가요?**
셸은 원래 쓰던 그대로 씁니다. 그 위에 Claude Code / Codex용 기능이 더해진 정도라고 보면 됩니다.

**무료인가요? 데이터는 어디로 가나요?**
무료이고 MIT 라이선스입니다. 앱이 인터넷으로 보내는 건 없습니다. 대화 기록은 Claude Code / Codex가 원래 PC에 저장해 두는 파일을 읽기만 합니다.

## 후원

혼자 만들고 있는 무료 앱입니다. 써 보고 괜찮으셨다면 커피 한 잔 사 주세요. 후원금은 macOS 공증이랑 Windows 코드 서명 인증서부터 마련하는 데 쓰려고 합니다. 그러면 위의 설치 경고가 사라집니다.

- GitHub Sponsors: 저장소 위쪽 Sponsor 버튼
- Buy Me a Coffee: https://buymeacoffee.com/minsugwon
- 계좌: iM뱅크 `508-13-061547-7` (권민수)

Star만 눌러 주셔도 힘이 됩니다.

---

<a id="english"></a>

## English

MinsuTerm is a free, open-source terminal for Windows and macOS, made for people who run Claude Code and Codex CLI every day.

Use your usual shell. When you run `claude` or `codex` in a tab, MinsuTerm starts tracking it:

- **Agent view.** The sidebar groups your prompts by project folder into waiting / in progress / done, with how long each took. Subagents show up as little "minions" under the task and get a check mark when they finish.
- **Notifications.** You get a desktop notification when an agent finishes, or when it asks you to pick an option.
- **Session restore.** Reopen the app and your tabs and Claude / Codex conversations pick up where you left off. Past conversations are searchable, and deleted ones can be restored from the trash.
- **Split panes.** Drag a tab onto the terminal to split it, drag a pane's header to move it or turn it back into a tab, and zoom into one pane when you need room.
- **Prompt composer.** Long prompts are awkward to type on a terminal line, so there's a separate editor: open it from the composer button in the status bar (or Ctrl+Shift+E), write as many lines as you like, drop files in for their paths, and send it to the agent. Typing effects and sounds work there too.
- **Decorations.** Animated working borders (a relay race, Santa's sleigh, a train...), celebrations when a task is done, animated backgrounds, typing effects and sounds, and dark and light themes.
- **Languages.** Korean, English, Japanese and Chinese.

**Install.** Download from [Releases](../../releases/latest). On Windows, if SmartScreen shows up, choose More info > Run anyway. On macOS, the app isn't notarized yet: if it says the app is damaged, run `xattr -cr .` in the unzipped folder, then `bash "MinsuTerm 설치.command"`.

**Privacy.** MinsuTerm doesn't send anything over the network. It only reads the transcript files Claude Code and Codex already keep on your machine.

**Support.** If it's useful to you, you can sponsor through GitHub Sponsors or [Buy Me a Coffee](https://buymeacoffee.com/minsugwon). It goes toward Apple notarization and Windows code signing first.

## License

[MIT](LICENSE). Sound credits are in [SOUND-CREDITS.md](SOUND-CREDITS.md).

<sub>Claude and Claude Code are trademarks of Anthropic. Codex is a trademark of OpenAI. MinsuTerm is an independent project and isn't affiliated with either company.</sub>
