# My Next App

A modern Next.js 14 application built with TypeScript, Tailwind CSS, and shadcn/ui components.

## Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org) with App Router
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: [shadcn/ui](https://ui.shadcn.com/)
- **Code Quality**: [ESLint](https://eslint.org/)

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── globals.css        # Global styles with Tailwind
│   ├── layout.tsx         # Root layout component
│   └── page.tsx          # Home page
├── components/
│   └── ui/               # shadcn/ui components
├── hooks/                # Custom React hooks
├── lib/                  # Utility functions
├── types/                # TypeScript type definitions
└── constants/            # Application constants
```

## Features

- ✅ Next.js 15 with App Router
- ✅ TypeScript configuration
- ✅ Tailwind CSS v4 setup
- ✅ shadcn/ui components integration
- ✅ ESLint configuration
- ✅ Custom hooks (useLocalStorage)
- ✅ TypeScript types organization
- ✅ Constants management
- ✅ Utility functions (cn helper)

## Prerequisites

This project requires **Node.js 20+**. Install via

```bash
# with nvm
nvm install 20
nvm use 20

# or asdf
asdf install nodejs 20
asdf local nodejs 20
```

## Getting Started

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run the development server**:
   ```bash
   npm run dev
   ```

3. **Open your browser**:
   Navigate to [http://localhost:3000](http://localhost:3000)

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Adding shadcn/ui Components

To add new shadcn/ui components:

```bash
npx shadcn@latest add [component-name]
```

Example:
```bash
npx shadcn@latest add card
npx shadcn@latest add input
npx shadcn@latest add dialog
```

## Customization

### Tailwind CSS
Customize your design system in `tailwind.config.ts`

### shadcn/ui
Modify component styles and behavior in `src/components/ui/`

### Global Styles
Update global styles in `src/app/globals.css`

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [shadcn/ui Documentation](https://ui.shadcn.com/docs)

## Environment Variables

Create a local copy of the environment template and fill in your own values:

```bash
cp .env.example .env.local
# then edit .env.local
```

| Variable | Description | Where to set (Local) | Where to set (Vercel/Azure) |
|----------|-------------|----------------------|-----------------------------|
| `AZURE_TRANSLATOR_KEY` | Azure Cognitive Services key | `.env.local` | Project → Settings → Environment Variables |
| `AZURE_TRANSLATOR_REGION` | Azure region where Cognitive Services resource lives | `.env.local` | Project → Settings → Environment Variables |
| `AZURE_TRANSLATOR_ENDPOINT` | (Optional) Custom endpoint for Translator API | `.env.local` | Project → Settings → Environment Variables |

---

## Deployments

### Vercel (Recommended)

1. Push your code to GitHub.
2. Sign in to [Vercel](https://vercel.com) and import the repository.
3. When prompted, add the environment variables defined above.
4. Press **Deploy**. Vercel will build and deploy automatically using the `vercel.json` configuration.

Every subsequent push to `main` (or the branch you chose) will trigger a new deployment.

### Azure Static Web Apps

Azure Static Web Apps is a fully-managed option to host your Next.js application on Azure.

1. Create a new **Static Web App** resource in the Azure Portal.
2. Choose **GitHub** as the deployment source and select the repository.
3. When asked for a build preset, select **Custom** (the workflow in `.github/workflows/azure-static-web-apps.yml` is already present).
4. Set the following build parameters when prompted:
   - **App location**: `/`
   - **Output location**: `.next`
5. Add the required environment variables (`AZURE_TRANSLATOR_*`) in the **Configuration → Application settings** section of your Static Web App.
6. Save and let Azure run the workflow; your site will be available on the provided URL.

---

## Continuous Integration

* **GitHub Actions** – The workflow `azure-static-web-apps.yml` handles build and deployment to Azure Static Web Apps.
* **Vercel** – Vercel automatically sets up a CI pipeline when you import the repo.

---

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme).

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
