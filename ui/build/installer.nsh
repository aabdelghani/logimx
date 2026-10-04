; LogiMX setup wizard additions (electron-builder NSIS, assisted installer).
;
; Pages: Welcome > License > Just me / everyone > Folder > Options (this file) > Install > Finish.
; The Options page decides two things: start LogiMX at sign-in (the same HKCU Run value the app's
; own setting writes, named by the app id) and a desktop shortcut.

!include nsDialogs.nsh
!include LogicLib.nsh

!define LOGIMX_RUN_KEY "Software\Microsoft\Windows\CurrentVersion\Run"
!define LOGIMX_RUN_NAME "io.github.aabdelghani.logimx"

!ifndef BUILD_UNINSTALLER
Var LogiMXStartup
Var LogiMXDesktop
Var LogiMXStartupBox
Var LogiMXDesktopBox
!endif

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to LogiMX"
  !define MUI_WELCOMEPAGE_TEXT "LogiMX sets up MX Master mice and MX Keys keyboards: buttons, gestures, the action ring, backlight, Easy-Switch and Flow.$\r$\n$\r$\nIf Logi Options+ is installed, quit it before you use LogiMX. Both programs drive the same devices and only one of them can.$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_PAGE_WELCOME
!macroend

; expanded where the wizard's pages are declared, after the headers ${isUpdated} needs
!macro customPageAfterChangeDir
  Page custom LogiMXOptionsPage LogiMXOptionsLeave

Function LogiMXOptionsPage
  ${if} ${isUpdated}
    Abort   ; an update keeps the choices made the first time
  ${endif}
  !insertmacro MUI_HEADER_TEXT "Options" "Choose how LogiMX starts."
  nsDialogs::Create 1018
  Pop $0
  ${if} $0 == error
    Abort
  ${endif}
  ${NSD_CreateLabel} 0 0 100% 24u "LogiMX keeps your button and key settings working in the background. It sits in the notification area while it runs."
  Pop $0
  ${NSD_CreateCheckbox} 0 34u 100% 12u "&Start LogiMX when I sign in to Windows"
  Pop $LogiMXStartupBox
  ${NSD_CreateCheckbox} 0 52u 100% 12u "Create a &desktop shortcut"
  Pop $LogiMXDesktopBox
  ; first visit: both on; coming back with Back: what was chosen
  ${if} $LogiMXStartup == ""
    StrCpy $LogiMXStartup ${BST_CHECKED}
    StrCpy $LogiMXDesktop ${BST_CHECKED}
  ${endif}
  ${NSD_SetState} $LogiMXStartupBox $LogiMXStartup
  ${NSD_SetState} $LogiMXDesktopBox $LogiMXDesktop
  nsDialogs::Show
FunctionEnd

Function LogiMXOptionsLeave
  ${NSD_GetState} $LogiMXStartupBox $LogiMXStartup
  ${NSD_GetState} $LogiMXDesktopBox $LogiMXDesktop
FunctionEnd
!macroend


; Close LogiMX and its agent before files are replaced or removed: the agent runs on after the
; window closes and would keep logimx-agent.exe locked.
!macro customCheckAppRunning
  DetailPrint "Closing LogiMX..."
  nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /im "${APP_EXECUTABLE_FILENAME}" /f /t`
  Pop $0
  nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /im logimx-agent.exe /f`
  Pop $0
  Sleep 500
!macroend

!macro customInstall
  ${ifNot} ${isUpdated}
    ${if} $LogiMXStartup == ${BST_CHECKED}
      WriteRegStr HKCU "${LOGIMX_RUN_KEY}" "${LOGIMX_RUN_NAME}" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --hidden'
    ${else}
      DeleteRegValue HKCU "${LOGIMX_RUN_KEY}" "${LOGIMX_RUN_NAME}"
    ${endif}
    ${if} $LogiMXDesktop == ${BST_CHECKED}
      CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
    ${endif}
  ${endif}
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "${LOGIMX_RUN_KEY}" "${LOGIMX_RUN_NAME}"
    Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  ${endif}
!macroend
