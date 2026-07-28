// Jenkinsfile — Binder-Os Playwright pipeline
//
// Ye file abhi repo me padi rahegi. Jab tum Jenkins server setup karoge,
// wahan ek "Pipeline" job banake isi repo ko point karoge — Jenkins ye
// file khud utha lega. Isse abhi kuch run nahi hota; ye sirf recipe hai.
//
// SECRETS: BINDER_USER / BINDER_PASS repo me NAHI aate. Jenkins ke
// "Credentials" store me daale jaate hain (neeche setup guide me steps),
// aur pipeline unhe env variable ke through padh leti hai.

pipeline {
  // Jis Jenkins machine/agent pe chalega. Abhi 'any' — koi bhi available agent.
  agent any

  // Tests ko jo env variables chahiye. Actual values Jenkins Credentials se
  // aa rahi hain (credentials('id') = Jenkins secret store se uthao).
  environment {
    BINDER_USER = credentials('binder-user')   // Jenkins me is ID se secret banega
    BINDER_PASS = credentials('binder-pass')
    CI = 'true'                                 // Playwright ko batata hai ki CI me chal raha hai
  }

  options {
    timeout(time: 30, unit: 'MINUTES')   // 30 min se zyada chala to fail (hang na ho)
    disableConcurrentBuilds()            // ek waqt me ek hi run
  }

  stages {

    stage('Checkout') {
      steps {
        // GitHub se latest code lao
        checkout scm
      }
    }

    stage('Install dependencies') {
      steps {
        // npm ci = package-lock.json se EXACT versions install (repeatable)
        bat 'npm ci'
      }
    }

    stage('Install Playwright browsers') {
      steps {
        // CI machine pe browsers + unki system dependencies install karo
        bat 'npx playwright install --with-deps'
      }
    }

    stage('Run tests') {
      steps {
        // Saare tests chalao. HTML report generate hogi (config me reporter hona chahiye).
        bat 'npx playwright test'
      }
    }
  }

  post {
    // Chahe pass ho ya fail — report hamesha save karo
    always {
      // HTML report ko Jenkins me archive karo (baad me download/dekh sako)
      archiveArtifacts artifacts: 'playwright-report/**', allowEmptyArchive: true

      // Agar Jenkins me "HTML Publisher" plugin installed hai, to report
      // seedhe Jenkins UI me dikhane ke liye ye uncomment kar dena:
      // publishHTML(target: [
      //   reportDir: 'playwright-report',
      //   reportFiles: 'index.html',
      //   reportName: 'Playwright Report',
      //   keepAll: true,
      //   alwaysLinkToLastBuild: true,
      //   allowMissing: true
      // ])
    }
  }
}