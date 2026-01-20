# Enable Powerlevel10k instant prompt. Should stay close to the top of ~/.zshrc.
# Initialization code that may require console input (password prompts, [y/n]
# confirmations, etc.) must go above this block; everything else may go below.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

export PATH="/opt/homebrew/bin:$PATH"
export PATH="$PATH:/Users/muzz/.local/bin"
export PATH="/Applications/OrbStack.app/Contents/Resources/bin:$PATH"
export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"
export PATH=$PATH:/opt/puppetlabs/bin
export PATH="$HOME/bin:$PATH"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

export EDITOR="cursor --wait"

# Aliases
alias zs='source ~/.zshrc'
alias ..='cd ..'
alias back='cd -'
alias ...='cd ../..'
alias cpu='top -o cpu'
alias desk='cd ~/Desktop'
alias dev='cd ~/dev'
alias home='cd ~'
alias mem='top -o rsize'
alias myip='curl ipinfo.io/ip'
alias ports='lsof -i -P | grep LISTEN'
alias speed='speedtest'
alias weather='curl wttr.in'
alias h='cat ~/.zsh_history'
alias y='yazi'
alias e='exit'
alias c='clear'
alias la='ls -lah'
alias ll='ls -l'
alias s='ncspot'
alias vi='nvim'
alias vim='nvim'
alias sv='source .venv/bin/activate'
alias k='cursor'
alias kk='cursor .'
alias kz='cursor ~/.zshrc'
alias vz='vim ~/.zshrc'
alias zstuff='grep -E "^(alias|[a-zA-Z_][a-zA-Z0-9_]*\(\))" ~/.zshrc | grep -v "grep" && echo "\n--- Functions ---" && sed -n "/^[a-zA-Z_][a-zA-Z0-9_]*() {/,/^}/p" ~/.zshrc'
alias repo='tree -I "__pycache__|node_modules|dist|build|target|vendor|bin|obj|.git|.idea|.vscode|.DS_Store|*.pyc|*.pyo|*.pyd|*.so|*.dll|*.exe|logs|*.log|coverage|.pytest_cache|.tox|.venv|htmlcov|*.egg-info|npm-debug.log*|Thumbs.db|.npm|.yarn"'
alias cd="z"
alias rmuv='rm -rf .venv .python-version uv.lock hello.py pyproject.toml'
alias tailscale="/Applications/Tailscale.app/Contents/MacOS/Tailscale"
alias gits='git status'
alias oc='opencode'
alias gitv='gh repo view --web'
alias gitr='git remote -v'


ss_to_gdrive() {
  local filename
  if [ -n "$1" ]; then
    filename="${1}.png"
  else
    filename="ss_$(date +%Y%m%d_%H%M%S).png"
  fi
  local temp_file="/tmp/${filename}"
  
  pngpaste "$temp_file" && \
  rclone copy "$temp_file" muzz:Screenshots && \
  rclone link "muzz:Screenshots/$(basename "$temp_file")" | cx && \
  rm "$temp_file"
}

latestdl() {
  local latest_file
  latest_file=$(ls -t ~/Downloads | head -n 1)
  if [[ -n "$latest_file" ]]; then
    local full_path="$HOME/Downloads/$latest_file"
    if [[ $# -eq 0 ]]; then
      printf "'%s'" "$full_path"
    else
      "$@" "'$full_path'"
    fi
  fi
}

eval "$(uv generate-shell-completion zsh)"

_uv_run_mod() {
    if [[ "$words[2]" == "run" && "$words[CURRENT]" != -* ]]; then
        # Check if any previous argument after 'run' ends with .py
        if [[ ${words[3,$((CURRENT-1))]} =~ ".*\.py" ]]; then
            # Already have a .py file, complete any files
            _arguments '*:filename:_files'
        else
            # No .py file yet, complete only .py files
            _arguments '*:filename:_files -g "*.py"'
        fi
    else
        _uv "$@"
    fi
}
compdef _uv_run_mod uv

gitac() {
  git add -A .
  git commit -m "$1"
}


gitc() {
  git commit -m "$1"
}

gitp() {
  git add -A .
  git commit -m "$1"
  git push
}

source /opt/homebrew/share/powerlevel10k/powerlevel10k.zsh-theme

# To customize prompt, run `p10k configure` or edit ~/.p10k.zsh.
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh
source /opt/homebrew/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
source /opt/homebrew/share/zsh-autosuggestions/zsh-autosuggestions.zsh


# ---- Zoxide (better cd) ----
eval "$(zoxide init zsh)"

# history setup
HISTFILE=$HOME/.zsh_history
SAVEHIST=10000
HISTSIZE=10000
setopt share_history
setopt hist_expire_dups_first
setopt hist_ignore_dups
setopt hist_verify

zstyle ':completion:*' auto-description 'specify: %d'
zstyle ':completion:*' completer _expand _complete _correct _approximate
zstyle ':completion:*' format 'Completing %d'
zstyle ':completion:*' group-name ''
zstyle ':completion:*' menu select=2
zstyle ':completion:*' list-prompt %SAt %p: Hit TAB for more, or the character to insert%s
zstyle ':completion:*' matcher-list '' 'm:{a-z}={A-Z}' 'm:{a-zA-Z}={A-Za-z}' 'r:|[._-]=* r:|=* l:|=*'
zstyle ':completion:*' menu select=long
zstyle ':completion:*' select-prompt %SScrolling active: current selection at %p%s
zstyle ':completion:*' use-compctl false
zstyle ':completion:*' verbose true

zstyle ':completion:*:*:kill:*:processes' list-colors '=(#b) #([0-9]#)*=0=01;31'
zstyle ':completion:*:kill:*' command 'ps -u $USER -o pid,%cpu,tty,cputime,cmd'


fpath+=~/.zfunc
autoload -Uz compinit && compinit
# bun completions
[ -s "/Users/muzz/.bun/_bun" ] && source "/Users/muzz/.bun/_bun"

# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

select-forward-word() {
  zle .forward-word
}
select-backward-word() {
  zle .backward-word
}
zle -N select-forward-word
zle -N select-backward-word

WORDCHARS='-._@%&=+#'

source $(brew --prefix)/opt/zsh-vi-mode/share/zsh-vi-mode/zsh-vi-mode.plugin.zsh

# Shift + Right Arrow  -> Select to next word
bindkey '^[[1;2C' select-forward-word
# Shift + Left Arrow   -> Select to previous word
bindkey '^[[1;2D' select-backward-word


# completion using arrow keys (based on history)
bindkey '^[[A' history-search-backward
bindkey '^[[B' history-search-forward

bindkey '^[[1;3D' backward-word
bindkey '^[[1;3C' forward-word

export PATH="/Library/TeX/texbin:$PATH"

if ! pgrep -f "etsu" > /dev/null; then
    cd /Users/muzz/dev/etsu && nohup ./target/release/etsu > /dev/null 2>&1 &
fi

# Added by Antigravity
export PATH="/Users/muzz/.antigravity/antigravity/bin:$PATH"

if command -v wt >/dev/null 2>&1; then eval "$(command wt config shell init zsh)"; fi

alias hno='echo "H. no: 8-13-141/3, Kings colony, Shastripuram, Hyderabad, Telangana" | cx'
source ~/.secrets
