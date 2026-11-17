; MinsuTerm installer customisation
; Default install location: C:\Program Files\MinsuTerm (electron-builder per-machine default).
; Earlier test builds defaulted to C:\Program Files\WezTerm\MinsuTerm and stored that as the
; remembered location; reset it so the standard location is offered again.

!macro preInit
  SetRegView 64
  StrCpy $0 ""
  ReadRegStr $0 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $0 == "$PROGRAMFILES64\WezTerm\MinsuTerm"
    WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$PROGRAMFILES64\MinsuTerm"
  ${EndIf}
  SetRegView 32
!macroend
