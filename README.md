# claude-mods

Claude Code용 mod 모음입니다.

## usage-band

채팅 입력창 위에 **5시간 사용량**과 **주간 사용량**을 막대, 퍼센트, 초기화까지 남은 시간으로 보여줍니다.

```
5시간 ███░░░░░░░░░ 24%  3시간 12분 후 초기화   주간 ██████░░░░░░ 51%  2일 4시간 후 초기화
```

- 모든 세션이 사용량을 공유합니다. 어느 세션에서든 응답을 받으면 그 값이 공유 파일에 기록되고, 다른 세션들은 30초마다 그 파일을 읽어 가장 최근 값을 보여줍니다.
- 70% 이상이면 노란색, 90% 이상이면 빨간색으로 표시됩니다.

## 설치

터미널 세션의 프롬프트에서:

```
/plugin install usage-band --marketplace ch96dev/claude-mods
```

`Add marketplace?`에 `y`를 입력한 뒤 설치 범위(scope)를 고르면 됩니다.

셸에서:

```
claude plugin install usage-band --marketplace ch96dev/claude-mods
```

데스크톱 앱에서는(`/plugin`이 동작하지 않는 경우): 입력창 옆 **+** → **Plugins** → **Add marketplace**에 `ch96dev/claude-mods` 입력 → **Add plugin**.
