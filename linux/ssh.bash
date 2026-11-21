# Loaded by interactive Bash. Only the SSH cue leaves the shell.
[[ $- == *i* && -n ${XDG_RUNTIME_DIR:-} ]] || return 0
_dushnila_ssh_cue() {
    if [[ -d $XDG_RUNTIME_DIR/dushnila-pet ]]; then
        : > "$XDG_RUNTIME_DIR/dushnila-pet/ssh"
    fi
}
# Also catch pasted commands and commands recalled from history.
if [[ $(type -t ssh) == file ]]; then
    function ssh {
        _dushnila_ssh_cue
        command ssh "$@"
    }
fi
_dushnila_space() {
    local prefix spaces
    prefix=${READLINE_LINE:0:READLINE_POINT}
    printf -v spaces '%*s' "${READLINE_ARGUMENT:-1}" ''
    READLINE_LINE=$prefix$spaces${READLINE_LINE:READLINE_POINT}
    (( READLINE_POINT += ${#spaces} ))
    if [[ $prefix =~ ^[[:blank:]]*ssh$ ]]; then
        _dushnila_ssh_cue
    fi
}
for _dushnila_map in emacs-standard vi-insertion; do
    if bind -m "$_dushnila_map" -p 2>/dev/null | grep -Fx '" ": self-insert' >/dev/null; then
        bind -m "$_dushnila_map" -x '" ":_dushnila_space'
    fi
done
unset _dushnila_map
