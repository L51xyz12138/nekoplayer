<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { LogIn } from 'lucide-vue-next'
import { useEmby } from '@/composables/useEmby'
import { useLibrary } from '@/composables/useLibrary'

const router = useRouter()
const { login, error } = useEmby()
const { loadFromEmby } = useLibrary()

const serverUrl = ref('')
const username = ref('')
const password = ref('')
const submitting = ref(false)

async function submit() {
  if (!serverUrl.value.trim() || !username.value.trim()) return
  submitting.value = true
  try {
    await login(serverUrl.value, username.value, password.value)
    await loadFromEmby()
    router.push('/')
  } catch {
    // 错误信息展示在 error
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="login">
    <div class="login__card">
      <div class="login__logo">ネ</div>
      <h1 class="login__title">连接媒体服务器</h1>
      <p class="login__sub">输入你的 Emby 服务器地址与账号，公网或局域网都可以喵～</p>

      <form class="login__form" @submit.prevent="submit">
        <label class="field">
          <span class="field__label">服务器地址</span>
          <input
            v-model="serverUrl"
            class="field__input"
            placeholder="http://192.168.1.10:8096 或 https://你的域名"
          />
        </label>
        <label class="field">
          <span class="field__label">用户名</span>
          <input v-model="username" class="field__input" placeholder="登录账号" />
        </label>
        <label class="field">
          <span class="field__label">密码</span>
          <input v-model="password" class="field__input" type="password" placeholder="登录密码" />
        </label>

        <p v-if="error" class="login__error">{{ error }}</p>

        <button class="login__btn" :disabled="submitting" type="submit">
          <LogIn :size="18" />
          {{ submitting ? '连接中…' : '连接' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100vh;
  padding: 24px;
}
.login__card {
  width: 100%;
  max-width: 420px;
  padding: 40px 36px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  backdrop-filter: var(--blur);
  box-shadow: var(--shadow-pop);
  text-align: center;
}
.login__logo {
  display: grid;
  place-items: center;
  width: 60px;
  height: 60px;
  margin: 0 auto 20px;
  border-radius: 18px;
  font-size: 30px;
  font-weight: 800;
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  box-shadow: 0 8px 22px var(--accent-glow);
}
.login__title {
  font-size: 22px;
  font-weight: 800;
}
.login__sub {
  margin-top: 8px;
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--text-mute);
}
.login__form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 28px;
  text-align: left;
}
.field__label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 650;
  color: var(--text-dim);
}
.field__input {
  width: 100%;
  height: 46px;
  padding: 0 14px;
  font-size: 14px;
  color: var(--text);
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  outline: none;
  transition: border-color var(--dur) var(--ease);
}
.field__input::placeholder {
  color: var(--text-mute);
}
.field__input:focus {
  border-color: var(--accent);
}
.login__error {
  padding: 10px 14px;
  font-size: 13px;
  color: #ff8b8b;
  background: rgba(255, 107, 107, 0.1);
  border: 1px solid rgba(255, 107, 107, 0.25);
  border-radius: var(--r-md);
}
.login__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 48px;
  margin-top: 4px;
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border-radius: var(--r-md);
  box-shadow: 0 8px 22px var(--accent-glow);
  transition: transform var(--dur) var(--ease), opacity var(--dur);
}
.login__btn:hover:not(:disabled) {
  transform: translateY(-1px);
}
.login__btn:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
