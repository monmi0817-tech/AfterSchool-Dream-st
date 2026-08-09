# GitHub Release 업데이트 방법

저장소: `monmi0817-tech/AfterSchool-Dream-st`

## 최초 배포

1. `npm install`
2. `npm run dist:win`
3. `dist` 폴더에서 `Setup.exe`, `latest.yml`, `.blockmap` 파일을 GitHub Release에 함께 첨부합니다.
4. 태그와 Release 제목을 `v1.0.0`으로 만들고 정식 Release로 공개합니다.
5. 사용자는 Setup 파일을 설치합니다. 포터블 버전은 자동업데이트 대상이 아닙니다.

## 다음 버전 배포

1. `package.json`의 `version`을 올립니다. 예: `1.0.0` → `1.0.1`
2. `npm run dist:win`을 실행합니다.
3. GitHub에서 태그 `v1.0.1`의 새 Release를 만듭니다.
4. 새 `Setup.exe`, `latest.yml`, `.blockmap`을 모두 첨부하고 정식 Release로 공개합니다.

앱은 실행 후 GitHub Releases를 확인합니다. 최신 버전이 있으면 `업데이트` 또는 `나중에`를 묻고, 업데이트를 선택하면 다운로드 퍼센트와 게이지를 표시합니다.

## 중요

- 저장소는 Public이어야 별도 로그인 없이 모든 사용자에게 자동업데이트가 제공됩니다.
- Draft 또는 Pre-release가 아닌 정식 Release로 공개해야 합니다.
- `latest.yml`을 빠뜨리면 자동업데이트가 동작하지 않습니다.
- 설치형 앱의 `appId`는 이후 버전에서도 변경하지 마세요.
