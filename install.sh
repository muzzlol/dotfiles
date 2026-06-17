#!/bin/bash
ln -sf ~/dotfiles/zshrc ~/.zshrc
ln -sf ~/dotfiles/karabiner/karabiner.json ~/.config/karabiner/karabiner.json
ln -sf ~/dotfiles/wezterm/wezterm.lua ~/.config/wezterm/wezterm.lua
ln -sf ~/dotfiles/opencode/ ~/.config/opencode/
if [ -e ~/.agents ] && [ ! -L ~/.agents ]; then
  mv ~/.agents ~/.agents.pre-dotfiles-$(date +%Y%m%d%H%M%S)
fi
ln -sfn ~/dotfiles/agents ~/.agents
ln -sf ~/dotfiles/worktrunk/config.toml ~/.config/worktrunk/config.toml
ln -sf ~/dotfiles/tmux/tmux.conf ~/.config/tmux/tmux.conf
