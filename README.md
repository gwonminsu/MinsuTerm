<div align="center">

<img src="build/icon.png" width="96" alt="MinsuTerm icon">

# MinsuTerm

**Claude Code와 Codex를 쓴다면, 터미널은 이걸로.**

어느 탭이 일하는 중인지, 언제 끝났는지, 어제 하던 대화가 어디 있는지<br>
이제 터미널이 알아서 챙겨 줍니다.

[다운로드](../../releases/latest) · [English](#english) · [후원](#후원)

<img src="docs/media/agent.gif" width="880" alt="Claude Code가 서브에이전트 두 개를 돌리는 동안 사이드바에 작업과 하수인이 표시되고, 끝나면 완료 문구가 뜨는 화면">

</div>

## 설치하고 claude만 치면 됩니다

평소 쓰던 셸에서 `claude`나 `codex`를 실행하는 순간 에이전트 모드로 바뀝니다. 설정할 건 없습니다.

- **작업 현황판** 폴더별로 대기 / 진행 중 / 완료가 한눈에. 서브에이전트는 귀여운 하수인으로 붙어서 일합니다.
- **알림** 작업이 끝나거나 선택지를 물어보면 바로 알려 줍니다. 다른 창을 보고 있어도요.
- **세션 복원** 껐다 켜도 탭과 대화가 그대로 이어집니다.
- **화면 분할** 탭을 끌어다 놓으면 끝.
- **프롬프트 작성기** 긴 프롬프트는 따로 편하게 쓰고 한 번에 보내기.
- **꾸미기** 일하는 동안 테두리를 달리는 계주 선수, 끝나면 터지는 축하 효과, 배경과 타이핑 효과까지.
- **한국어 / English / 日本語 / 中文**

<img src="docs/media/split.gif" width="880" alt="탭을 끌어다 놓아 화면을 분할하고, 창 위치를 바꾸고, 다시 탭으로 되돌리는 화면">

<img src="docs/media/composer.gif" width="880" alt="작성기에서 여러 줄 프롬프트를 써서 Claude에게 보내면 계주 테두리가 돌다가 완료 문구가 뜨는 화면">

<img src="docs/media/border.gif" width="880" alt="작업 중 테두리가 계주, 추격전, 기차, 산타 썰매, 개미 행렬로 바뀌고 테마와 라이트 모드로 바뀌는 화면">

<img src="docs/media/deco.gif" width="880" alt="배경과 타이핑 효과를 바꾸며 타이핑하는 화면">

## 다운로드

[Releases](../../releases/latest)에서 Windows는 `.exe`, Mac은 칩에 맞는 `.zip`(Apple Silicon은 `arm64`, Intel은 `x64`)을 받으세요.

- Windows에서 "PC 보호" 창이 뜨면 **추가 정보 > 실행**
- Mac에서 "손상되었다"고 나오면 압축 푼 폴더에서 `xattr -cr .` 실행 후 `bash "MinsuTerm 설치.command"`

무료, 오픈소스(MIT)입니다. 인터넷으로 보내는 데이터는 없습니다.

## 후원

혼자 만드는 앱입니다. 마음에 드셨다면 커피 한 잔으로 응원해 주세요. 위의 설치 경고를 없애는 데(Apple 공증, Windows 코드 서명) 먼저 쓰겠습니다.

[Buy Me a Coffee](https://buymeacoffee.com/minsugwon) · GitHub Sponsors(위쪽 Sponsor 버튼) · iM뱅크 `508-13-061547-7` (권민수)

Star 하나도 큰 힘이 됩니다.

---

## 자주 묻는 질문

**Claude Code 쓰기 좋은 터미널이 있나요?**
MinsuTerm이 그 용도로 만든 터미널입니다. 작업 현황과 서브에이전트를 보여 주고, 끝나면 알려 주고, 다시 열면 대화를 이어 줍니다.

**Codex CLI도 되나요?**
네. `codex`도 똑같이 인식합니다.

**지금 쓰는 셸이나 설정을 바꿔야 하나요?**
아니요. cmd, PowerShell, zsh 등 원래 쓰던 셸을 그대로 씁니다.

**무료인가요? 내 데이터는 어디로 가나요?**
무료(MIT)이고, 인터넷으로 보내는 건 없습니다. Claude Code / Codex가 원래 PC에 저장하는 대화 기록 파일을 읽기만 합니다.

---

<a id="english"></a>

## English summary

**MinsuTerm is the terminal for Claude Code and Codex.** It's a free, open-source (MIT) app for Windows and macOS.

Run `claude` or `codex` in your usual shell (cmd, PowerShell, zsh) and the tab switches to agent mode. No setup needed.

- **Agent dashboard.** Prompts are grouped by project folder into waiting / in progress / done. Subagents show up as little minions under the task.
- **Notifications.** Get notified when an agent finishes or asks you to pick an option, even while you're in another app.
- **Session restore.** Close the app and your tabs and Claude / Codex conversations come back next time.
- **Split panes.** Drag a tab onto the terminal to split it.
- **Prompt composer.** Write long, multi-line prompts in a separate editor and send them in one go.
- **Decorations.** Working borders (a relay race, Santa's sleigh...), celebrations when a task is done, animated backgrounds, typing effects and sounds, dark and light themes.
- **Languages.** Korean, English, Japanese, Chinese.

**Download** from [Releases](../../releases/latest): the `.exe` for Windows, or the `.zip` for your Mac (`arm64` for Apple Silicon, `x64` for Intel). On Windows, choose *More info > Run anyway* if SmartScreen appears. On macOS, if the app is reported as damaged, run `xattr -cr .` in the unzipped folder, then `bash "MinsuTerm 설치.command"`. The app isn't notarized yet.

**Privacy.** Nothing is sent over the network. MinsuTerm only reads the transcript files Claude Code and Codex already keep on your computer.

**Support.** It's a one-person project. If you like it, [buy me a coffee](https://buymeacoffee.com/minsugwon) or sponsor on GitHub. It goes toward Apple notarization and Windows code signing first.

<sub>Claude and Claude Code are trademarks of Anthropic. Codex is a trademark of OpenAI. MinsuTerm is an independent project. Sound credits: [SOUND-CREDITS.md](SOUND-CREDITS.md)</sub>
