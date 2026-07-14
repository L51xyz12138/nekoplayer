import { createRouter, createWebHashHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'library',
      component: () => import('@/views/LibraryView.vue')
    },
    {
      path: '/detail/:id',
      name: 'detail',
      component: () => import('@/views/DetailView.vue'),
      props: true
    },
    {
      path: '/collection/:id',
      name: 'collection',
      component: () => import('@/views/CollectionView.vue'),
      props: true
    },
    {
      path: '/person',
      name: 'person',
      component: () => import('@/views/PersonView.vue')
    },
    {
      path: '/trakt',
      name: 'trakt',
      component: () => import('@/views/TraktView.vue')
    },
    {
      path: '/stats',
      name: 'stats',
      component: () => import('@/views/StatsView.vue')
    },
    {
      path: '/sources',
      name: 'sources',
      component: () => import('@/views/SourcesView.vue')
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue')
    },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ],
  scrollBehavior() {
    return { top: 0 }
  }
})
