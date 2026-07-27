import globals from 'globals';

export default [
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        $: 'readonly',
        jQuery: 'readonly',
        toastr: 'readonly',
        _: 'readonly',
        moment: 'readonly',
        Fuse: 'readonly',
        DOMPurify: 'readonly',
        hljs: 'readonly',
        SillyTavern: 'readonly',
        __BBT_VERSION__: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
    },
  },
];
