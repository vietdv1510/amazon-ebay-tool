; Force kill running app BEFORE any installer check
; customHeader runs in NSIS header section - earliest possible point
!macro customHeader
  !define MUI_FINISHPAGE_RUN_NOTCHECKED
!macroend

; customInit runs in .onInit - before installer sections
!macro customInit
  ; Kill main process and all children
  nsExec::ExecToLog 'taskkill /F /T /IM ebay-engine.exe'
  ; Also try wmic as fallback (handles edge cases)
  nsExec::ExecToLog 'wmic process where name="ebay-engine.exe" call terminate'
  ; Wait for process to fully die + OS to release file locks
  Sleep 3000
!macroend

!macro customUnInit
  nsExec::ExecToLog 'taskkill /F /T /IM ebay-engine.exe'
  Sleep 2000
!macroend
